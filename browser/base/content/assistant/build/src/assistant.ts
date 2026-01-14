import { Annotation, END, START, StateGraph } from "@langchain/langgraph/web";
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import { routeRemote, chatRemote } from "./proxyClient";
import SupabaseAuth from "./services/supabase";
import voiceInputService from "./services/voiceInput";
import { UsageTracker } from "./services/usageTracker";
import { UsageLogger } from "./services/usageLogger";

// Local command implementations (tabs / groups)
import {
  ListTabsCommand,
  OpenTabCommand,
  CloseTabCommand,
  MoveTabToNewWindowCommand,
  CopyTabUrlsCommand,
  SplitTabsCommand,
  CreateHubCommand,
  DeleteHubCommand,
  ListHubsCommand,
  RenameHubCommand,
  AddTabToHubCommand,
  OpenHubCommand,
  NewWindowCommand,
  OrganizeWindowsCommand,
  ShowURLCommand,
  SearchMemoryCommand,
  Command,
  CmdResult,
} from "./commands";

// Expose Supabase auth for UI
const supabaseAuth = SupabaseAuth.getInstance();
(window as any).supabaseAuth = supabaseAuth;

// Expose voice input service for UI
(window as any).voiceInputService = voiceInputService;

// Expose usage tracker for UI
(window as any).usageTracker = UsageTracker.getInstance();

// Expose usage logger for UI
(window as any).usageLogger = UsageLogger.getInstance();

/* ========= Ephemeral chat history per session ========= */
// Automatically managed - one session per sidebar instance
let CURRENT_SESSION: BaseMessage[] = [];
const MAX_TURNS = 12; // keep last 12 user/assistant pairs

function getCurrentSessionMessages(): BaseMessage[] {
  return CURRENT_SESSION;
}

function pushCurrentTurn(user: string, assistant: string) {
  CURRENT_SESSION.push(new HumanMessage(user));
  CURRENT_SESSION.push(new AIMessage(assistant));

  const cap = MAX_TURNS * 2;
  if (CURRENT_SESSION.length > cap) {
    CURRENT_SESSION.splice(0, CURRENT_SESSION.length - cap);
  }
}

export function resetAssistantSession() {
  CURRENT_SESSION = [];
}

export function getAssistantHistory(): BaseMessage[] {
  return [...CURRENT_SESSION];
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
  if (Array.isArray(c))
    return c
      .map(v => (typeof v === "string" ? v : v?.text || ""))
      .join("");
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
      console.log(`🏷️ Executing ${command.commandName} with args:`, state.args);

      const result: CmdResult = await command.execute(state.args);
      const content = `[Tool Output for ${command.commandName}]: ${result.message}`;

      return {
        messages: [new AIMessage({ content, name: command.commandName })],
        // Strong state clearing to prevent re-running
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

**Worker Arguments**
- **list_tabs**: No arguments needed
- **open_tab**: { url: string } - the website URL to open
- **close_tab**: { index?: number } - OPTIONAL 1-based tab number (e.g., "close tab 2" = { index: 2 }). If no index, closes active tab.
- **move_tab_to_new_window**: { index?: number } - OPTIONAL 1-based tab number
- **copy_tab_urls**: No arguments needed
- **split_tabs**: { indices: [number, number, ...] } - split tabs into side-by-side windows (e.g., "split tab 1 and 2" = { indices: [1, 2] })
- **create_hub**: { name: string, include?: "none"|"current"|"all" }
- **delete_hub**: { name: string, closeTabs?: boolean }
- **list_hubs**: No arguments needed
- **rename_hub**: { from: string, to: string }
- **add_tab_to_hub**: { name: string }
- **open_hub**: { name: string, where?: "tabs"|"window" }
- **new_window**: No arguments needed
- **organize_windows**: No arguments needed
- **show_url**: { url: string }
- **search_memory**: { query: string, hub?: string } - search for keywords in bookmarks/hubs. Use this when user asks to "search" a hub or "find" something in memory.

**Rules**
1. **Analyze History:** Messages starting with \`[Tool Output for ...]\` are the results of a worker's action.
2. **Extract Arguments:** Convert tab numbers to 1-based indexes.
3. **Check for Completion:** If the user's request is already satisfied by the latest tool output, choose "FINISH".
4. **Handle Multi-Step:** If the user says "do X then Y", route step-by-step based on tool outputs.
5. **Chat:** If conversational (hello/thanks/etc), choose "chat".
6. **Handle Failures:** If a tool returns an error or "No matches found", do NOT retry—choose "chat".
7. **Default Action:** Otherwise choose the best worker for the most recent request.

**Output Format**
You MUST respond with a JSON object:
\`\`\`json
{ "next": "<worker>", "args": { ... } }
\`\`\`

The available workers are: {options}`.trim();

  const chatNode = async (state: typeof GraphState.State) => {
    const CHAT_PROMPT = `You are a helpful Firefox browser assistant.

**Context you receive**
- You receive the messages passed into this graph run (which may be minimal).
- Messages that start with "[Tool Output for ...]" indicate executed commands and their results.

**How to respond**
- If the user is asking a normal question, answer helpfully.
- If the user is asking what happened in this run, summarize using the tool outputs provided.
- Keep responses concise and action-oriented.`;

    // Debug: Log what messages the chat node receives
    console.log(
      `💬 Chat node received ${state.messages.length} messages:`,
      state.messages.map((m: any) => `${m._getType()}: ${msgText(m).substring(0, 50)}...`)
    );

    const res = await chatRemote(CHAT_PROMPT, toWire(state.messages));
    return { messages: [new AIMessage(res.content)] };
  };

  // Track recently executed commands to prevent duplicates (within a single graph execution)
  const recentlyExecutedCommands = new Set<string>();

  const supervisorNode = async (s: typeof GraphState.State) => {
    // IMPORTANT: include FINISH in allowed options (your router prompt uses it)
    const options = [END, ...memberNames, "chat", "FINISH"];

    const systemPrompt = systemTemplate
      .replace("{members}", memberNames.join(", "))
      .replace("{options}", options.join(", "));

    const messages = s.messages;
    const out = await routeRemote(systemPrompt, toWire(messages), options);

    const nextTool = out?.next;
    const nextArgs = out?.args || {};

    if (nextTool === "FINISH") {
      return { next: END };
    }

    if (nextTool && memberNames.includes(nextTool)) {
      const commandSignature = `${nextTool}:${JSON.stringify(nextArgs)}`;

      if (recentlyExecutedCommands.has(commandSignature)) {
        console.warn(`🚫 Supervisor blocked duplicate routing to: ${commandSignature}`);
        // Don't hard-end. Fall back to chat so UI gets a useful response.
        return { next: "chat", args: {} };
      }

      recentlyExecutedCommands.add(commandSignature);

      // Keep last 10 signatures
      if (recentlyExecutedCommands.size > 10) {
        const entries = Array.from(recentlyExecutedCommands);
        recentlyExecutedCommands.clear();
        entries.slice(-10).forEach(cmd => recentlyExecutedCommands.add(cmd));
      }

      return { next: nextTool, args: nextArgs };
    }

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
    new SplitTabsCommand(),
    // Hubs
    new CreateHubCommand(),
    new DeleteHubCommand(),
    new ListHubsCommand(),
    new RenameHubCommand(),
    new AddTabToHubCommand(),
    new OpenHubCommand(),
    new NewWindowCommand(),
    new OrganizeWindowsCommand(),
    new ShowURLCommand(),
    new SearchMemoryCommand(),
  ];

  const graph = await buildGraph(commands);

  // Minimal context to prevent command re-execution:
  // only pass the current user input to the graph.
  const currentInput = new HumanMessage({ content: prompt });
  console.log(`📝 Processing fresh input: "${prompt.substring(0, 50)}..."`);

  const stream = await graph.stream(
    { messages: [currentInput] },
    { recursionLimit: 16 }
  );

  let lastFull = "";
  let stepCount = 0;

  for await (const state of stream as any) {
    stepCount++;
    console.log(`🔄 Stream step ${stepCount}, keys:`, Object.keys(state));

    if ("__end__" in state) {
      console.log(`🔚 Stream ended. lastFull length: ${lastFull.length}`);
      break;
    }

    const step = Object.entries(state).find(([k]) => k !== "__end__");
    if (step?.[1] && "messages" in (step[1] as any)) {
      const stepData = step[1] as any;
      const lastMsg = stepData.messages.at(-1);

      if (stepData.next) {
        console.log(`🎯 Supervisor chose: ${stepData.next} with args:`, stepData.args);
      }

      if (lastMsg?.name && msgText(lastMsg).includes("[Tool Output for")) {
        console.log(
          `🔧 Tool executed: ${lastMsg.name} - ${msgText(lastMsg).substring(0, 100)}...`
        );
      }

      const text = msgText(lastMsg);

      if (text && text !== lastFull) {
        const delta = text.startsWith(lastFull) ? text.slice(lastFull.length) : text;

        // Prevent "tool-output spam" duplication in streaming deltas (lightweight guard)
        if (delta.includes("[Tool Output for") && lastFull.includes("[Tool Output for")) {
          console.warn(`🚨 Potential duplicate tool output detected in delta: ${delta}`);
        }

        onChunk(delta);
        lastFull = text;
        console.log(`📝 Updated lastFull, length now: ${lastFull.length}`);
      }
    }
  }

  console.log(`🏁 Stream finished. Final lastFull length: ${lastFull.length}`);

  // Save exactly once (no double-save)
  if (lastFull) {
    console.log(
      `✅ Saving turn to session: "${prompt}" -> "${lastFull.substring(0, 50)}..."`
    );
    pushCurrentTurn(prompt, lastFull);
  } else {
    console.log(`⚠️ NOT saving turn - lastFull is empty!`);
  }

  return lastFull || "(no output)";
}
