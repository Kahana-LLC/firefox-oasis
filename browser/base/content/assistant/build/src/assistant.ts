import { Annotation, END, START, StateGraph } from "@langchain/langgraph/web";
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import { routeRemote, chatRemote } from "./proxyClient";
import SupabaseAuth from "./services/supabase";
import voiceInputService from "./services/voiceInput";

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
  RemoveTabFromHubCommand,
  ShowSubscriptionCommand,
  Command,
  CmdResult,
} from "./commands";
import { subscriptionService } from "./services/subscription";

// Expose Supabase auth for UI
const supabaseAuth = SupabaseAuth.getInstance();
(window as any).supabaseAuth = supabaseAuth;

// Expose voice input service for UI
(window as any).voiceInputService = voiceInputService;

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
    // CHANGE: Overwrite previous value
    reducer: (_, y) => y ?? END, 
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
    // CHANGE: Overwrite previous arguments
    reducer: (_, y) => y ?? {}, 
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
      const content = `\n[Tool Output for ${command.commandName}]: ${result.message}`;
      return {
        messages: [new AIMessage({ content, name: command.commandName })],
        lastWorker: command.commandName,
        repeatCount: 0,
        // ADD THESE TWO LINES:
        next: "supervisor", 
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
1.  **Analyze History:** Review the conversation history. Messages starting with \`[Tool Output for ...]\` are the results of a worker's action.
2.  **Break Down the Plan:** Read the USER's latest message. Break it down into a chronological list of necessary steps/commands.
3.  **Find Next Step:** Compare the list of necessary steps against the "Tool Outputs" in the history. Identify the *first* step that has NOT yet been completed.
4.  **Execute Next Step:** Choose the worker for that specific next step. DO NOT skip steps.
5.  **Check for Completion:** Only choose "FINISH" if *ALL* steps in the user's latest request have been successfully completed. 
6.  **Chat:** If the user is just chatting or asking a question, choose "chat".
7.  **Default:** If unsure, choose the worker that addresses the earliest unfulfilled part of the request.

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

**IMPORTANT**: 
- If the user says "Open X and then Y", you MUST output the command for X first. Wait for the result. Then output the command for Y.
- Do NOT output "FINISH" until both X and Y are done.

**Examples**
User: "Open a new tab to google.com"
→ { "next": "open_tab", "args": { "url": "google.com" } }

User: "Close tab 3"
→ { "next": "close_tab", "args": { "index": 3 } }

User: "Open google.com. Then open yahoo.com."
→ First: { "next": "open_tab", "args": { "url": "google.com" } }
→ (After output): { "next": "open_tab", "args": { "url": "yahoo.com" } }

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
    const options = [END, ...memberNames, "chat", "FINISH"];
    const systemPrompt = systemTemplate
      .replace("{members}", memberNames.join(", "))
      .replace("{options}", options.join(", "));
  
    const out = await routeRemote(systemPrompt, toWire(s.messages), options);
    const nextTool = out?.next;
    const nextArgs = out?.args || {};
  
    // CHECK: If the tool just finished and the LLM tries to call it again, force to chat
    const lastMsg = s.messages[s.messages.length - 1];
    const isToolOutput = msgText(lastMsg).includes("[Tool Output for");
    
    console.log(`🕵️ Supervisor Check: lastWorker=${s.lastWorker}, nextTool=${nextTool}, isToolOutput=${isToolOutput}`);

    if (isToolOutput && nextTool === s.lastWorker) {
      console.log(`🛑 Stopping recursion: ${nextTool} repeated immediately after output.`);
      return { next: "chat", args: {} };
    }
  
    // Handle explicit completion
    if (nextTool === "FINISH" || nextTool === END) {
      return { next: END, args: {} };
    }
  
    if (nextTool && memberNames.includes(nextTool)) {
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
  onChunk: (text: string) => void,
  inputType: 'text' | 'voice' = 'text' // Add inputType parameter
): Promise<string> {
  const isAuthenticated = await supabaseAuth.isAuthenticated();
  if (!isAuthenticated) {
    const msg = "Please sign in to use the assistant.";
    onChunk(msg);
    return msg;
  }

  // Check Subscription Limits
  const stats = await subscriptionService.checkAvailability();
  if (stats.isLimitReached) {
      const msg = `Usage limit reached (${stats.totalUnits}/${stats.limit} units). Please upgrade your plan via the menu.`;
      onChunk(msg);
      // Open the subscription page automatically? Optional.
      // subscriptionService.getSubscriptionUrl();
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
    new RemoveTabFromHubCommand(),
    new OpenHubCommand(),
    new NewWindowCommand(),
    new OrganizeWindowsCommand(),
    new ShowURLCommand(),
    new SearchMemoryCommand(),
    new ShowSubscriptionCommand(),
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

  let combinedSessionString = "";
  let isSaved = false;
  let stepCount = 0;

  for await (const state of stream as any) {
    stepCount++;
    console.log(`🔄 Stream step ${stepCount}, keys:`, Object.keys(state));
    
    if ("__end__" in state) {
      console.log(`🔚 Stream ended. combined length: ${combinedSessionString.length}`);
      if (combinedSessionString && !isSaved) {
        console.log(`✅ Saving turn to session: "${prompt}" -> "${combinedSessionString.substring(0, 50)}..."`);
        pushCurrentTurn(prompt, combinedSessionString);
        subscriptionService.trackUsage(inputType);
        isSaved = true;
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

      if (text) {
          // Since our nodes return complete messages (not streaming tokens), 
          // we can just append and emit.
          // Note: If we had token streaming, we'd need per-message buffering.
          // For now, assume atomic messages.
          const newContent = text + "\n";
          onChunk(newContent);
          combinedSessionString += newContent;
      }
    }
  }
  console.log(`🏁 Stream finished. Final combined length: ${combinedSessionString.length}`);

  // SAFETY: Always save the turn even if we didn't hit __end__
  if (combinedSessionString && !isSaved) {
    console.log(`✅ Saving turn to session (post-stream): "${prompt}" -> "${combinedSessionString.substring(0, 50)}..."`);
    pushCurrentTurn(prompt, combinedSessionString);
    subscriptionService.trackUsage(inputType);
  }
  
  return combinedSessionString || "(no output)";
}
