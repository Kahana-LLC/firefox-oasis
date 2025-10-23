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

      const result: CmdResult = await command.execute(input);
      const nextRepeat =
        state.lastWorker === command.commandName ? (state.repeatCount ?? 0) + 1 : 1;

      return {
        messages: [new AIMessage({ content: result.message, name: command.commandName })],
        lastWorker: command.commandName,
        repeatCount: nextRepeat,
      };
    };

    toolAgents[command.commandName] = node;
    memberNames.push(command.commandName);
  }

  // ---------- Supervisor with routing rules + few-shots ----------
  const systemTemplate = `You are a supervisor managing a team of specialist workers.
Your goal is to choose the best worker for the job based on the user's request.
The available workers are:
{members}

Each worker has a specific job description.
Based on the user's request, choose the worker that is the best fit for the job.
The user's request will be forwarded to the worker you choose.

Your output MUST be a JSON object with a single key "next" and the value being the name of the worker you are choosing.
Example:
{
"next": "worker_name"
}

The available workers are: {options}
If no worker is a good fit, you can choose to "FINISH".

Here are the job descriptions for each worker:
{members}`.trim();

  const MAX_REPEAT = 2;

  const chatNode = async (state: typeof GraphState.State) => {
    const CHAT_PROMPT = "You are a helpful assistant.";
    const res = await chatRemote(CHAT_PROMPT, toWire(state.messages));
    return { messages: [new AIMessage(res.content)] };
  };

  const supervisorNode = async (s: typeof GraphState.State) => {
    if ((s.repeatCount ?? 0) >= MAX_REPEAT) return { next: END };

    const options = [END, ...memberNames, "chat"];
    const systemPrompt = systemTemplate
      .replace("{members}", memberNames.join(", "))
      .replace("{options}", options.join(", "));

    const out = await routeRemote(systemPrompt, toWire(s.messages), options);
    const nxt = out?.next && options.includes(out.next) ? out.next : END;
    return { next: nxt };
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
  const isAuthenticated = await supabaseAuth.isAuthenticated();
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
