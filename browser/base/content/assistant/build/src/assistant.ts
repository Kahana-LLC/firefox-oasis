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

**Worker Arguments**
- **list_tabs**: No arguments needed
- **open_tab**: { url: string } - the website URL to open
- **close_tab**: { index?: number } - OPTIONAL 1-based tab number (e.g., "close tab 2" = { index: 2 }). If no index, closes active tab.
- **move_tab_to_new_window**: { index?: number } - OPTIONAL 1-based tab number
- **copy_tab_urls**: No arguments needed
- **create_hub**: { name: string, include?: "none"|"current"|"all" }
- **delete_hub**: { name: string, closeTabs?: boolean }
- **list_hubs**: No arguments needed
- **rename_hub**: { from: string, to: string }
- **add_tab_to_hub**: { name: string }
- **open_hub**: { name: string, where?: "tabs"|"window" }

**Rules**
1.  **Analyze History:** Review the conversation history. Messages starting with \`[Tool Output for ...]\` are the results of a worker's action.
2.  **Extract Arguments:** When the user mentions tab numbers (e.g., "tab 2", "the first tab", "second one"), convert to { index: N } where N is 1-based.
3.  **Check for Completion:** If the last message is a \`[Tool Output for ...]\` and it seems to fulfill the user's last request, choose the "FINISH" worker.
4.  **Handle Multi-Step:** If the user's request requires another step (e.g., "open X *and then* do Y"), and you see the \`[Tool Output for ...]\` from the first step, choose the worker for the second step.
5.  **Chat:** If the user is making casual conversation (e.g., "hello", "thank you"), choose the "chat" worker.
6.  **Default Action:** Otherwise, choose the worker that best addresses the user's most recent unfulfilled request.

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

**Examples**
User: "Open a new tab to google.com"
→ { "next": "open_tab", "args": { "url": "google.com" } }

User: "Close tab 3"
→ { "next": "close_tab", "args": { "index": 3 } }

User: "Close the second tab"
→ { "next": "close_tab", "args": { "index": 2 } }

User: "List all tabs" then "close the first one"
→ First: { "next": "list_tabs", "args": {} }
→ Then: { "next": "close_tab", "args": { "index": 1 } }

The available workers are: {options}`.trim();

  const chatNode = async (state: typeof GraphState.State) => {
    const CHAT_PROMPT = `You are a helpful Firefox browser assistant with full conversation memory.

**Important:** You have access to the complete conversation history, including:
- All previous user requests
- Commands that were executed (marked as [Tool Output for ...])
- Results from those commands

**When answering questions:**
1. If asked to summarize or recall: Review the conversation history and list what happened
2. If asked general questions: Answer helpfully based on what you know
3. You can see everything that happened in this conversation - use that context!

**Example:**
If the history shows:
  - User: "list tabs"
  - Tool Output: "1. Google, 2. CNN"
  - User: "close the first tab"
  - Tool Output: "Closed: Google"
  
And user asks "what have we done?", you should respond:
"We listed the tabs (found Google and CNN), then closed the first tab (Google)."

Remember: You ARE stateful within this conversation. The history is right there in your context!`;
    
    // Debug: Log what messages the chat node receives
    console.log(`💬 Chat node received ${state.messages.length} messages:`, 
      state.messages.map((m: any) => `${m._getType()}: ${msgText(m).substring(0, 50)}...`));
    
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
  
  // Get conversation history for context - automatically managed
  const sessionHistory = getCurrentSessionMessages();
  
  // Debug: Log how many messages are in context
  console.log(`📚 Session context: ${sessionHistory.length} messages in history`);
  
  const stream = await graph.stream(
    { messages: [...sessionHistory, new HumanMessage({ content: prompt })] },
    { recursionLimit: 16 }
  );

  let lastFull = "";
  let stepCount = 0;
  for await (const state of stream as any) {
    stepCount++;
    console.log(`🔄 Stream step ${stepCount}, keys:`, Object.keys(state));
    
    if ("__end__" in state) {
      // Save conversation turn automatically
      console.log(`🔚 Stream ended. lastFull length: ${lastFull.length}`);
      if (lastFull) {
        console.log(`✅ Saving turn to session: "${prompt}" -> "${lastFull.substring(0, 50)}..."`);
        pushCurrentTurn(prompt, lastFull);
      } else {
        console.log(`⚠️ NOT saving turn - lastFull is empty!`);
      }
      break;
    }
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
        console.log(`📝 Updated lastFull, length now: ${lastFull.length}`);
      }
    }
  }
  console.log(`🏁 Stream finished. Final lastFull length: ${lastFull.length}`);
  
  // SAFETY: Always save the turn even if we didn't hit __end__
  if (lastFull) {
    console.log(`✅ Saving turn to session (post-stream): "${prompt}" -> "${lastFull.substring(0, 50)}..."`);
    pushCurrentTurn(prompt, lastFull);
  }
  
  return lastFull || "(no output)";
}
