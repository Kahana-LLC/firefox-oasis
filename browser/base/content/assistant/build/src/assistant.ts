import { Annotation, END, START, StateGraph } from "@langchain/langgraph/web";
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import { routeRemote } from "./proxyClient";

// Local command implementations (tabs / groups)
import {
  ListTabsCommand,
  OpenTabCommand,
  CloseTabCommand,
  MoveTabToNewWindowCommand,
  CopyTabUrlsCommand,
  CreateHubCommand,
  DeleteHubCommand,
  ListHubsCommand,
  RenameHubCommand,
  AddTabToHubCommand,
  OpenHubCommand,
  Command,
  CmdResult,
} from "./commands";

/* ========= Ephemeral chat history per session ========= */
const SESSIONS = new Map<string, BaseMessage[]>();
const MAX_TURNS = 12; // keep last 12 user/assistant pairs

function getSessionMessages(id: string) {
  if (!SESSIONS.has(id)) SESSIONS.set(id, []);
  return SESSIONS.get(id)!;
}
function pushTurn(id: string, user: string, assistant: string) {
  const msgs = getSessionMessages(id);
  msgs.push(new HumanMessage(user));
  msgs.push(new AIMessage(assistant));
  const cap = MAX_TURNS * 2;
  if (msgs.length > cap) msgs.splice(0, msgs.length - cap);
}

export function resetAssistantSession(id = "default") {
  SESSIONS.delete(id);
}
export function getAssistantHistory(id = "default"): BaseMessage[] {
  return [...(SESSIONS.get(id) || [])];
}

/* ========= LangGraph state ========= */
const GraphState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  next: Annotation<string>({
    reducer: (x, y) => y ?? x ?? END,
    default: () => END,
  }),
  lastWorker: Annotation<string>({
    reducer: (x, y) => y ?? x ?? "",
    default: () => "",
  }),
  repeatCount: Annotation<number>({
    reducer: (x, y) => (typeof y === "number" ? y : (x ?? 0)),
    default: () => 0,
  }),
});

/* ========= Helpers ========= */
function msgText(m: any): string {
  if (!m) return "";
  const c = m.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map(v => (typeof v === "string" ? v : v?.text || "")).join("");
  return String(c ?? "");
}

type WireMsg = { role: "user" | "model"; content: string };
function toWire(messages: BaseMessage[]): WireMsg[] {
  return messages.map(m => {
    const role = m._getType() === "human" ? "user" : "model";
    return { role, content: msgText(m) };
  });
}

/* ========= Build the tool graph ========= */
async function buildGraph(commands: Command[]) {
  const toolAgents: Record<string, any> = {};
  const memberNames: string[] = [];

  for (const command of commands) {
    // Node: take the last human content as input; run the command; emit AI text.
    const node = async (state: typeof GraphState.State) => {
      const msgs = state.messages;
      const lastHuman = [...msgs].reverse().find(m => (m as any)?._getType?.() === "human");
      const input = msgText(lastHuman);

      const res: CmdResult = await command.execute(input);
      const text = res.message || "";

      const nextRepeat =
        state.lastWorker === command.commandName ? (state.repeatCount ?? 0) + 1 : 1;

      return {
        messages: [new AIMessage(text)],
        lastWorker: command.commandName,
        repeatCount: nextRepeat,
      };
    };

    toolAgents[command.commandName] = node;
    memberNames.push(command.commandName);
  }

  /* ----- Remote router (AWS Lambda) prompt + few-shots ----- */

  const ROUTING_GUIDELINES = `
Pick exactly ONE next worker from {options}. If multiple steps are needed,
choose the earliest step first; you'll be invoked again after that worker runs.

Tabs:
- "open/go/navigate" to a site or URL → open_tab
- "list/show" current tabs → list_tabs
- "close" current tab or "tab N" → close_tab
- "move/detach to new window" → move_tab_to_new_window
- "copy/export/share all URLs" → copy_tab_urls

Hubs:
- "create hub", "new group" → create_hub
- "delete/remove hub <name>" → delete_hub
- "list hubs" → list_hubs
- "rename hub <old> to <new>" → rename_hub
- "add this tab to <hub>" → add_tab_to_hub
- "open/switch to hub <name>" → open_hub

Do not ask for confirmation; act directly when possible.
If uncertain, prefer list_tabs. If unsupported, FINISH.
`.trim();

  const FEWSHOTS = [
    `- "show my tabs" → list_tabs`,
    `- "open https://example.com" → open_tab`,
    `- "go to youtube" → open_tab`,
    `- "close this tab" → close_tab`,
    `- "move this tab to a new window" → move_tab_to_new_window`,
    `- "copy all tab urls" → copy_tab_urls`,
    `- "create hub Work" → create_hub`,
    `- "add this tab to Work" → add_tab_to_hub`,
    `- "rename hub Work to Projects" → rename_hub`,
    `- "open github then list tabs" → open_tab  (next turn will route to list_tabs)`,
  ].join("\n");

  const systemTemplate = `You are a supervisor managing: {members}.
Given the user request and conversation so far, choose who should act next.
Return only {"next": "<one of: {options}>"}.
Use FINISH if done.

${ROUTING_GUIDELINES}

Routing examples:
${FEWSHOTS}`.trim();

  const MAX_REPEAT = 2;

  const supervisorNode = async (s: typeof GraphState.State) => {
    if ((s.repeatCount ?? 0) >= MAX_REPEAT) return { next: END };

    const options = [END, ...memberNames];
    const systemPrompt = systemTemplate
      .replace("{members}", memberNames.join(", "))
      .replace("{options}", options.join(", "));

    const out = await routeRemote(systemPrompt, toWire(s.messages), options);
    const nxt = out?.next && options.includes(out.next) ? out.next : END;
    return { next: nxt };
  };

  /* ----- Wire the graph ----- */
  const workflow = new StateGraph(GraphState);
  for (const name of memberNames) {
    workflow.addNode(name, toolAgents[name]);
    workflow.addEdge(name as any, "supervisor" as any);
  }
  workflow.addNode("supervisor", supervisorNode);
  workflow.addConditionalEdges("supervisor" as any, (x: typeof GraphState.State) => x.next);
  workflow.addEdge(START, "supervisor" as any);

  return workflow.compile();
}

/* ========= Public APIs ========= */

// Streaming variant used by the UI for live updates.
export async function runAssistantStream(
  prompt: string,
  onChunk: (text: string) => void,
  opts?: { sessionId?: string }
): Promise<string> {
  const sessionId = opts?.sessionId || "default";

  const commands: Command[] = [
    // Tabs
    new ListTabsCommand(),
    new OpenTabCommand(),
    new CloseTabCommand(),
    new MoveTabToNewWindowCommand(),
    new CopyTabUrlsCommand(),
    // Hubs
    new CreateHubCommand(),
    new DeleteHubCommand(),
    new ListHubsCommand(),
    new RenameHubCommand(),
    new AddTabToHubCommand(),
    new OpenHubCommand(),
  ];

  const graph = await buildGraph(commands);
  const seed = [...getSessionMessages(sessionId), new HumanMessage({ content: prompt })];

  const stream = await graph.stream({ messages: seed }, { recursionLimit: 16 });

  let lastFull = "";
  for await (const state of stream as any) {
    if ("__end__" in state) break;

    // exclude the special __end__ key and pull the node payload
    const step = Object.entries(state).find(([k]) => k !== "__end__");
    const payload = step?.[1];

    if (payload && typeof payload === "object" && "messages" in payload) {
      const msgs = (payload as any).messages;
      const lastMsg = Array.isArray(msgs) ? msgs[msgs.length - 1] : undefined;

      let text = "";
      if (typeof lastMsg?.content === "string") {
        text = lastMsg.content;
      } else if (Array.isArray(lastMsg?.content)) {
        text = lastMsg.content
          .map((c: any) => (typeof c === "string" ? c : c?.text || ""))
          .join("");
      } else if (lastMsg?.content != null) {
        text = String(lastMsg.content);
      }

      if (text && text !== lastFull) {
        const delta = text.startsWith(lastFull) ? text.slice(lastFull.length) : text;
        onChunk(delta);
        lastFull = text;
      }
    }
  }

  const finalText = lastFull || "(no output)";
  pushTurn(sessionId, prompt, finalText);
  return finalText;
}
