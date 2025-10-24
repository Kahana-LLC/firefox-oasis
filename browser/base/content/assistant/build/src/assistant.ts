import { Annotation, END, START, StateGraph } from "@langchain/langgraph/web";
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import { routeRemote, chatRemote } from "./proxyClient";
import SupabaseAuth from "./services/supabase";

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

// Expose Supabase auth for UI
const supabaseAuth = SupabaseAuth.getInstance();
(window as any).supabaseAuth = supabaseAuth;

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
  args: Annotation<Record<string, any>>({
    reducer: (x, y) => (y ? { ...(x || {}), ...y } : x),
    default: () => ({}),
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
    // Node: run the command and emit a message that clearly identifies the tool's output.
    const node = async (state: typeof GraphState.State) => {
      const result: CmdResult = await command.execute(state.args);
      const content = `[Tool Output for ${command.commandName}]: ${result.message}`;
      return {
        messages: [new AIMessage({ content, name: command.commandName })],
        // Clear state to prevent re-running the same tool
        lastWorker: "",
        repeatCount: 0,
        args: {},
      };
    };

    toolAgents[command.commandName] = node;
    memberNames.push(command.commandName);
  }

  // ---------- Supervisor with routing rules + few-shots ----------
  const systemTemplate = `You are a supervisor agent that manages a team of workers.
Your job is to intelligently route the user's request to the appropriate worker.
You will be given the user's request and the conversation history.

**Workers**
You have the following workers available:
{members}

**Rules**
1.  **Analyze History:** Review the conversation history. Messages starting with \`[Tool Output for ...]\` are the results of a worker's action.
2.  **Check for Completion:** If the last message is a \`[Tool Output for ...]\` and it seems to fulfill the user's last request, choose the "FINISH" worker.
3.  **Handle Multi-Step:** If the user's request requires another step (e.g., "open X *and then* do Y"), and you see the \`[Tool Output for ...]\` from the first step, choose the worker for the second step.
4.  **Chat:** If the user is making casual conversation (e.g., "hello", "thank you"), choose the "chat" worker.
5.  **Default Action:** Otherwise, choose the worker that best addresses the user's most recent unfulfilled request.

**Output Format**
You MUST respond with a JSON object that follows this schema:
\`\`\`json
{
  "next": "<name of the chosen worker>",
  "args": {
    "<argument_name>": "<argument_value>"
  }
}
\`\`\`

**Example**
User request: "Open a new tab to google.com and then tell me what tabs I have open."

*First Turn*
\`\`\`json
{
  "next": "open_tab",
  "args": { "url": "google.com" }
}
\`\`\`

*Second Turn (after the tab is opened)*
\`\`\`json
{
  "next": "list_tabs",
  "args": {}
}
\`\`\`

*Third Turn (after the tabs are listed)*
\`\`\`json
{
  "next": "FINISH",
  "args": {}
}
\`\`\`

The available workers are: {options}`.trim();

  const chatNode = async (state: typeof GraphState.State) => {
    const CHAT_PROMPT = "You are a helpful assistant.";
    const res = await chatRemote(CHAT_PROMPT, toWire(state.messages));
    return { messages: [new AIMessage(res.content)] };
  };

  const supervisorNode = async (s: typeof GraphState.State) => {
    const options = [END, ...memberNames, "chat"];
    const systemPrompt = systemTemplate
      .replace("{members}", memberNames.join(", "))
      .replace("{options}", options.join(", "));

    // Use only the messages from the current graph execution for routing decisions.
    const messages = s.messages;
    const out = await routeRemote(systemPrompt, toWire(messages), options);
    const nextTool = out?.next;
    const nextArgs = out?.args || {};

    // The supervisor can return "FINISH" to end the conversation.
    if (nextTool === "FINISH") {
      return { next: END };
    }

    // If the supervisor selected a valid tool, use it.
    if (nextTool && memberNames.includes(nextTool)) {
      return { next: nextTool, args: nextArgs };
    }

    // Otherwise, fall back to chat. This handles conversational replies.
    return { next: "chat", args: {} };
  };

  const workflow = new StateGraph(GraphState);
  for (const name of memberNames) {
    workflow.addNode(name, toolAgents[name]);
    workflow.addEdge(name as any, "supervisor" as any);
  }
  workflow.addNode("chat", chatNode);
  workflow.addEdge("chat" as any, END as any);
  workflow.addNode("supervisor", supervisorNode);
  workflow.addConditionalEdges("supervisor" as any, (x: typeof GraphState.State) => x.next);
  workflow.addEdge(START, "supervisor" as any);

  return workflow.compile();
}

// ---------- Public APIs ----------

// Streaming variant used by the UI for live updates
export async function runAssistantStream(
  prompt: string,
  onChunk: (text: string) => void
): Promise<string> {
  const isAuthenticated = await supabaseAuth. isAuthenticated();
  if (!isAuthenticated) {
    const msg = "Please sign in to use the assistant.";
    onChunk(msg);
    return msg;
  }

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
  const stream = await graph.stream(
    { messages: [new HumanMessage({ content: prompt })] },
    { recursionLimit: 16 }
  );

  let lastFull = "";
  for await (const state of stream as any) {
    if ("__end__" in state) break;
    const step = Object.entries(state).find(([k]) => k !== "__end");
    if (step?.[1] && "messages" in (step[1] as any)) {
      const lastMsg = (step[1] as any).messages.at(-1);
      let text = "";
      if (typeof lastMsg?.content === "string") text = lastMsg.content;
      else if (Array.isArray(lastMsg?.content))
        text = lastMsg.content.map((c: any) => (typeof c === "string" ? c : c?.text || "")).join("");
      else if (lastMsg?.content != null) text = String(lastMsg.content);

      if (text && text !== lastFull) {
        const delta = text.startsWith(lastFull) ? text.slice(lastFull.length) : text;
        onChunk(delta);
        lastFull = text;
      }
    }
  }
  return lastFull || "(no output)";
}
