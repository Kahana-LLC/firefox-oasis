import { marked } from "marked";
import DOMPurify from "dompurify";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph/web";
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import { routeRemote, chatRemote } from "./proxyClient";
import SupabaseAuth from "./services/supabase";
import voiceInputService from "./services/voiceInput";

// Local command implementations (tabs / groups / hubs)
import {
  ListTabsCommand,
  OpenTabCommand,
  CloseTabCommand,
  MoveTabToNewWindowCommand,
  CopyTabUrlsCommand,
  SplitTabsCommand,
  AddSplitViewCommand,
  RemoveSplitViewCommand,
  CreateBookmarkFolderCommand,
  DeleteBookmarkFolderCommand,
  ListBookmarkFoldersCommand,
  RenameBookmarkFolderCommand,
  AddTabToBookmarkFolderCommand,
  OpenBookmarkFolderCommand,
  NewWindowCommand,
  OrganizeWindowsCommand,
  ShowURLCommand,
  SearchMemoryCommand,
  OpenSearchResultCommand,
  SummarizePageCommand,
  RemoveTabFromBookmarkFolderCommand,
  ShowSubscriptionCommand,
  ListTabGroupsCommand,
  CreateTabGroupCommand,
  DeleteTabGroupCommand,
  AddTabToGroupCommand,
  RemoveTabFromGroupCommand,
  RenameTabGroupCommand,
  ConfirmActionCommand,
  getPendingConfirmation,
  clearPendingConfirmation,
  Command,
  CmdResult,
} from "./commands";
import { subscriptionService } from "./services/subscription";

// Expose Supabase auth for UI
const supabaseAuth = SupabaseAuth.getInstance();
(window as any).supabaseAuth = supabaseAuth;

// Expose voice input service for UI
(window as any).voiceInputService = voiceInputService;

// Expose libraries for UI access
(window as any).marked = marked;
(window as any).DOMPurify = DOMPurify;

/* ========= Ephemeral chat history per session ========= */
// Managed via a singleton JSM to ensure all windows (sidebar, panel) share the exact same array in memory.
let AssistantSession: any = null;

try {
  // @ts-ignore
  if (window.ChromeUtils && window.ChromeUtils.importESModule) {
    // @ts-ignore
    const mod = window.ChromeUtils.importESModule(
      "chrome://browser/content/assistant/AssistantSession.sys.mjs"
    );
    AssistantSession = mod.AssistantSession;
    console.log("Successfully imported AssistantSession singleton.");
  } else {
    console.warn(
      "ChromeUtils not available, falling back to local state (will desync)."
    );
    AssistantSession = {
      _messages: [],
      get messages() {
        return [...this._messages];
      },
      addTurn(u: any, a: any) {
        this._messages.push(u);
        this._messages.push(a);
      },
      clear() {
        this._messages = [];
      },
      setSession(m: any) {
        this._messages = m;
      },
    };
  }
} catch (e) {
  console.error("Failed to import AssistantSession.sys.mjs", e);
  // Fallback
  AssistantSession = {
    _messages: [],
    get messages() {
      return [...this._messages];
    },
    addTurn(u: any, a: any) {
      this._messages.push(u);
      this._messages.push(a);
    },
    clear() {
      this._messages = [];
    },
    setSession(m: any) {
      this._messages = m;
    },
  };
}

// Listen for updates from the singleton (dispatched via Services.obs)
try {
  // @ts-ignore
  if (window.Services && window.Services.obs) {
    const observer = {
      observe: (subject: any, topic: string, data: any) => {
        if (topic === "oasis-session-updated") {
          console.log("Received oasis-session-updated observer notification.");
          try {
            window.dispatchEvent(new CustomEvent("oasis-history-update"));
          } catch (e) {}
        }
      },
    };
    // @ts-ignore
    window.Services.obs.addObserver(observer, "oasis-session-updated", false);
  }
} catch (e) {
  console.error("Failed to add observer", e);
}

function getCurrentSessionMessages(): BaseMessage[] {
  // Map raw objects back to LangChain instances if needed
  // (The JSM stores them as is. If we push LangChain objects, they stay as objects)
  // But strictly, we should ensure they are instances.
  const raw = AssistantSession.messages;
  return raw.map((m: any) => {
    // If it's already an instance, great. If plain object, convert.
    // Check if it has _getType
    if (typeof m._getType === "function") return m;

    // Fallback based on type property if we stored plain JSON
    if (m.type === "human") return new HumanMessage(m.content);
    if (m.type === "ai") return new AIMessage(m.content);

    // Default
    return new HumanMessage(m.content || "");
  });
}

function pushCurrentTurn(user: string, assistant: string) {
  // We create instances here
  const u = new HumanMessage(user);
  const a = new AIMessage(assistant);

  AssistantSession.addTurn(u, a);
  // No need to save to localStorage manually, JSM holds it in memory.
  // We can persist to disk if we want session restoration across browser restarts,
  // but for "toggle sidebar" sync, memory singleton is sufficient and faster.
}

export function resetAssistantSession() {
  AssistantSession.clear();
  try {
    window.dispatchEvent(new CustomEvent("oasis-history-update"));
  } catch (e) {}
}
(window as any).resetAssistantSession = resetAssistantSession;

export function getAssistantHistory(): BaseMessage[] {
  return getCurrentSessionMessages();
}
(window as any).getAssistantHistory = getAssistantHistory;

/* ========= LangGraph state ========= */

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
  if (Array.isArray(c))
    return c.map(v => (typeof v === "string" ? v : v?.text || "")).join("");
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
async function buildGraph(commands: Command[], messageId?: string) {
  const toolAgents: Record<string, any> = {};
  const memberNames: string[] = [];

  console.log(
    `🔨 buildGraph: oasisRecordToolActionStart type: ${typeof (window as any).oasisRecordToolActionStart}`
  );

  for (const command of commands) {
    // Node: run the command and emit a message that clearly identifies the tool's output.
    const node = async (state: typeof GraphState.State) => {
      const recordStart = (window as any).oasisRecordToolActionStart;
      const recordUpdate = (window as any).oasisRecordToolActionUpdate;
      let actionId: string | undefined;

      console.log(
        `🔨 Executing node: ${command.commandName}, messageId: ${messageId}`
      );

      if (typeof recordStart === "function") {
        actionId = recordStart(command.commandName, messageId);
        console.log(`🔨 recordStart called, got actionId: ${actionId}`);
      } else {
        console.warn(`🔨 recordStart is NOT a function: ${typeof recordStart}`);
      }

      let result: CmdResult;
      try {
        result = await command.execute(state.args);
        console.log(
          `🔨 command.execute finished: ${command.commandName}, success: ${!!result}`
        );
        if (typeof recordUpdate === "function" && actionId) {
          recordUpdate(actionId, "done");
        }
      } catch (e) {
        console.error(`🔨 command.execute failed: ${command.commandName}`, e);
        if (typeof recordUpdate === "function" && actionId) {
          recordUpdate(actionId, "error", String(e));
        }
        result = { message: String(e) };
      }

      // If the command requires confirmation, stop the graph and let the modal handle it
      if (result.requiresConfirmation) {
        console.log(`⏸️ Command ${command.commandName} requires confirmation, stopping graph`);
        return {
          messages: [new AIMessage({ content: "", name: command.commandName })],
          lastWorker: command.commandName,
          repeatCount: 0,
          next: END,
          args: {},
        };
      }

      const content = `\n[Tool Output for ${command.commandName}]: ${result.message}`;
      return {
        messages: [new AIMessage({ content, name: command.commandName })],
        lastWorker: command.commandName,
        repeatCount: 0,
        next: "supervisor",
        args: {},
      };
    };

    toolAgents[command.commandName] = node;
    memberNames.push(command.commandName);
  }

  // ---------- Supervisor with routing rules + few-shots ----------
  const systemTemplate =
    `You are a supervisor agent that manages a team of workers.
Your job is to intelligently route the user's LATEST request to the appropriate worker.

**IMPORTANT: Treat each user message as an INDEPENDENT request!**
- The user might ask a general question, then ask to delete a tab group - these are SEPARATE requests.
- Do NOT get confused by conversation history. Focus on the CURRENT message.
- If the current message says "delete tab group X", route to delete_tab_group, even if previous messages were questions.

**Workers**
You have the following workers available:
{members}

**IMPORTANT: Bookmark Folders vs Tab Groups**
- **Bookmark Folders** are persistent collections of bookmarks. Use them for saving pages for later. Commands: create_bookmark_folder, add_tab_to_bookmark_folder, etc.
- **Tab Groups** are visual groupings of OPEN tabs in the current window. Use them for organizing your current workspace. Commands: create_tab_group, add_tab_to_group, etc.

**Worker Arguments**

*Tab Commands:*
- **list_tabs**: No arguments needed
- **open_tab**: { url: string } - the website URL to open
- **close_tab**: { index?: number } - OPTIONAL 1-based tab number. REQUIRES CONFIRMATION.
- **move_tab_to_new_window**: { index?: number } - OPTIONAL 1-based tab number
- **copy_tab_urls**: No arguments needed
- **split_tabs**: { indices: [number, number, ...] } - split tabs into side-by-side windows

*Split View Commands (side-by-side tabs in same window):*
- **add_split_view**: { indices?: [number, number], withIndex?: number, withQuery?: string } - add split view. Use 'indices' to specify two tabs by number (e.g., [1, 2]). Use 'withIndex' or 'withQuery' to split current tab with another. If no args, opens current tab with new tab.
- **remove_split_view**: No arguments needed - remove split view from current tab (unsplit)

*Bookmark Folder Commands (Persistent):*
- **create_bookmark_folder**: { name: string, include?: "none"|"current"|"all" } - create folder
- **delete_bookmark_folder**: { name: string, closeTabs?: boolean } - REQUIRES CONFIRMATION
- **list_bookmark_folders**: No arguments needed
- **rename_bookmark_folder**: { from: string, to: string }
- **add_tab_to_bookmark_folder**: { name: string } - add current tab as bookmark to folder
- **remove_tab_from_bookmark_folder**: { name: string, url?: string }
- **open_bookmark_folder**: { name: string, where?: "tabs"|"window"|"tabgroup" } - open all bookmarks from a folder. Default ("tabs") opens in current window. "window" opens in a NEW window. "tabgroup" creates a visual tab group in the current window. IMPORTANT: When the user says "in a new window", use where: "window". When they say "as a tab group" or "in a tab group", use where: "tabgroup".

*Tab Group Commands (Visual Grouping - Current Window Only):*
- **list_tab_groups**: No arguments needed - list visual tab groups
- **create_tab_group**: { name: string, indices?: number[], openUrl?: string } - create visual group. Use 'openUrl' to open a URL in the new group.
- **delete_tab_group**: { name: string, closeTabs?: boolean } - REQUIRES CONFIRMATION
- **add_tab_to_group**: { name: string, query?: string, index?: number, all?: boolean } - add tab(s) to visual group. Use 'all: true' to add ALL ungrouped tabs. Use 'query' to find specific tab by name. Examples: "add all tabs to Work" → { name: "Work", all: true }. "add Reddit to streaming" → { name: "streaming", query: "Reddit" }.
- **remove_tab_from_group**: { index?: number } - ungroup a tab
- **rename_tab_group**: { from: string, to: string } - rename a visual tab group

*Search & Memory Commands:*
- **search_memory**: { query: string, folder?: string } - search across browsing history, bookmarks, managed bookmark folders, open tabs, tab groups, and stored memory. Use 'folder' to filter to a specific bookmark folder. Returns JSON with a 'summary' string, 'resultsBySource' (grouped by source), and flat 'results' array. Each result has: source ("history"|"bookmark"|"bookmark-folder"|"tab"|"tab-group"|"memory"), title, url, context, snippet. Present results grouped by source for clarity.
- **open_search_result**: { url: string, type?: "tab"|"history"|"bookmark" } - open a search result. type="tab" switches to existing tab if found, otherwise opens new tab.

*Other Commands:*
- **new_window**: No arguments needed
- **organize_windows**: No arguments needed
- **show_url**: { url: string }
- **summarize_page**: { index?: number, query?: string } - summarize a webpage. Use 'index' for tab number, 'query' to find tab by title/URL. No args = current tab.
- **confirm_action**: { confirmed: boolean } - confirm or cancel a pending action

**Confirmation Handling**
Some commands require user confirmation before executing (close_tab, delete_bookmark_folder, delete_tab_group).
When a user says "yes", "confirm", "do it", "go ahead" after a confirmation request, use: { "next": "confirm_action", "args": { "confirmed": true } }
When a user says "no", "cancel", "nevermind", use: { "next": "confirm_action", "args": { "confirmed": false } }

**CRITICAL: Focus on the LATEST user message only!**
Each user message is an INDEPENDENT request. Do NOT let previous conversation influence your routing decision.
Always analyze the CURRENT/LATEST message to decide which worker to use.

**Rules**
1.  **Keyword Detection in LATEST Message:** Look at the user's LATEST message ONLY. If it contains these keywords, use the browser tool:
    - "tab", "tabs" → tab commands
    - "split view", "splitview", "split" → split view commands (add_split_view, remove_split_view)
    - "group", "tab group" → tab group commands (create_tab_group, delete_tab_group, add_tab_to_group, etc.)
    - "bookmark", "folder" → bookmark folder commands
    - "window" → window commands
    - "summarize", "summary", "what is this page" → summarize_page
    - "search", "find", "memory", "history", "recall", "remember", "look up", "have I visited" → search_memory, open_search_result
    - Action words: "open", "close", "delete", "create", "add", "remove", "rename", "list", "show", "unsplit", "summarize", "search", "find"
2.  **General Questions → Chat:** If the LATEST message is a question or request NOT about browser actions, choose "chat".
3.  **Each Message is New:** Ignore the conversation pattern. Just because previous messages were questions doesn't mean the current one is. Evaluate EACH message independently.
4.  **History for Context Only:** Use conversation history only to understand context (like which tab group was mentioned before), NOT to decide the worker type.
5.  **Nested/Multi-Step Commands:** Many commands support compound actions in a single call:
    - "Create folder X and add current tab" → create_bookmark_folder with include: "current"
    - "Create folder X and add all tabs" → create_bookmark_folder with include: "all"
    - "Create tab group X and open Y in it" → create_tab_group with openUrl
    When a single command can handle the full request, prefer that over multiple steps.
6.  **Multi-Tool Sequences:** If the user's message requires TWO DIFFERENT tools in sequence (e.g., "open google.com and then summarize it"), route to the FIRST tool. After it completes, evaluate the original user message again to find the NEXT uncompleted action and route to the appropriate tool. Do NOT route to "chat" until ALL requested actions are done.
7.  **Check for Completion:** Only choose "FINISH" if ALL steps have been completed.

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
(After confirmation request) User: "yes"
→ { "next": "confirm_action", "args": { "confirmed": true } }

User: "Group my first 3 tabs as Work"
→ { "next": "create_tab_group", "args": { "name": "Work", "indices": [1, 2, 3] } }

User: "Create a tab group movies and open imdb.com in it"
→ { "next": "create_tab_group", "args": { "name": "movies", "openUrl": "imdb.com" } }

User: "Add the Wikipedia tab to the social group"
→ { "next": "add_tab_to_group", "args": { "name": "social", "query": "Wikipedia" } }

User: "Add Reddit to the streaming group"
→ { "next": "add_tab_to_group", "args": { "name": "streaming", "query": "Reddit" } }

User: "Add the Netflix tab to streaming"
→ { "next": "add_tab_to_group", "args": { "name": "streaming", "query": "Netflix" } }

User: "Add this tab to Work group" (no specific tab name mentioned)
→ { "next": "add_tab_to_group", "args": { "name": "Work" } } (uses current tab)

User: "Add all tabs to the project group"
→ { "next": "add_tab_to_group", "args": { "name": "project", "all": true } }

User: "Add all existing tabs to streaming"
→ { "next": "add_tab_to_group", "args": { "name": "streaming", "all": true } }

User: "Save this tab to my Research folder"
→ { "next": "add_tab_to_bookmark_folder", "args": { "name": "Research" } }

User: "Open my travel folder"
→ { "next": "open_bookmark_folder", "args": { "name": "travel" } }

User: "Open the travel folder in a new window"
→ { "next": "open_bookmark_folder", "args": { "name": "travel", "where": "window" } }

User: "Open my work folder as a tab group"
→ { "next": "open_bookmark_folder", "args": { "name": "work", "where": "tabgroup" } }

User: "Open the recipes folder in a tab group"
→ { "next": "open_bookmark_folder", "args": { "name": "recipes", "where": "tabgroup" } }

User: "Create a folder called travel and add the current tab to it"
→ { "next": "create_bookmark_folder", "args": { "name": "travel", "include": "current" } }

User: "Make a new folder called work and save all tabs"
→ { "next": "create_bookmark_folder", "args": { "name": "work", "include": "all" } }

User: "Create a bookmark folder recipes and add this tab"
→ { "next": "create_bookmark_folder", "args": { "name": "recipes", "include": "current" } }

User: "Add split view" or "Split this tab"
→ { "next": "add_split_view", "args": {} }

User: "Split tab 1 and 2" or "Add tab 1 and 2 to split view"
→ { "next": "add_split_view", "args": { "indices": [1, 2] } }

User: "Split view with the Amazon tab"
→ { "next": "add_split_view", "args": { "withQuery": "Amazon" } }

User: "Split view with tab 2"
→ { "next": "add_split_view", "args": { "withIndex": 2 } }

User: "Remove split view" or "Unsplit tabs"
→ { "next": "remove_split_view", "args": {} }

User: "Summarize this page" or "What is this page about?"
→ { "next": "summarize_page", "args": {} }

User: "Summarize tab 1" or "Summarize the first tab"
→ { "next": "summarize_page", "args": { "index": 1 } }

User: "Summarize the Amazon tab"
→ { "next": "summarize_page", "args": { "query": "Amazon" } }

User: "Rename tab group Work to Projects"
→ { "next": "rename_tab_group", "args": { "from": "Work", "to": "Projects" } }

User: "delete tab group Work"
→ { "next": "delete_tab_group", "args": { "name": "Work" } }

User: "delete the Science group"
→ { "next": "delete_tab_group", "args": { "name": "Science" } }

User: "remove tab group xyz"
→ { "next": "delete_tab_group", "args": { "name": "xyz" } }

User: "What is the capital of France?"
→ { "next": "chat", "args": {} }

User: "Explain how photosynthesis works"
→ { "next": "chat", "args": {} }

User: "Help me with my code"
→ { "next": "chat", "args": {} }

User: "Hi" or "Hello" or "Thanks"
→ { "next": "chat", "args": {} }

User: "Search for Amazon in my bookmarks"
→ { "next": "search_memory", "args": { "query": "Amazon" } }

User: "Find anything about cooking in my Research folder"
→ { "next": "search_memory", "args": { "query": "cooking", "folder": "Research" } }

User: "Have I visited any Python tutorials?"
→ { "next": "search_memory", "args": { "query": "Python tutorial" } }

User: "Search my history for flights"
→ { "next": "search_memory", "args": { "query": "flights" } }

User: "What did I save in my Work folder?"
→ { "next": "search_memory", "args": { "query": "*", "folder": "Work" } }

The available workers are: {options}`.trim();

  const chatNode = async (state: typeof GraphState.State) => {
    const CHAT_PROMPT = `You are Oasis AI, a helpful and knowledgeable assistant integrated into Firefox. You can help with ANYTHING - not just browser tasks.

**Your Capabilities:**
- Answer ANY question on any topic (science, history, coding, math, writing, etc.)
- Help with creative tasks (writing, brainstorming, explaining concepts)
- Provide advice and recommendations
- Assist with coding and technical problems
- Have casual conversations
- Format tool outputs when browser commands have been executed

**Important:** You have access to the complete conversation history, including:
- All previous user requests
- Commands that were executed (marked as [Tool Output for ...])
- Results from those commands

**Response Guidelines:**
1. **Use Markdown:** Format your answers beautifully using Markdown.
   - Use **bold** for key terms or emphasis.
   - Use bullet points or numbered lists for organized information.
   - Use \`code blocks\` for code, URLs, or technical terms.
   - Use headings for longer explanations.
2. **Be Helpful:** Answer questions thoroughly and accurately. If you don't know something, say so.
3. **Interpret Data:** If a tool returns raw data (like JSON), format it into a human-readable response. NEVER output raw JSON.
4. **Natural Tone:** Be friendly and conversational. Don't mention internal workings or "tool outputs".
5. **Context Aware:** Use the conversation history to provide relevant, contextual responses.

**Formatting search_memory Results:**
When the tool output contains search results (from search_memory), the data is structured JSON with:
- **summary**: A short description like "Found 5 results for 'Amazon'".
- **resultsBySource**: Results grouped by source (e.g., "history", "bookmark-folder", "tab").
- **results**: Flat array of all matches with source, title, url, context, snippet.

Present them grouped by source with clear headings. For example:

**Browsing History**
- [Page Title](url) - snippet of matching content

**Bookmark Folder: Research**
- [Saved Article](url) - snippet

**Open Tabs**
- [Tab Title](url) - snippet

If results are empty, say so naturally ("I couldn't find anything matching X in your history or bookmarks.").
If results come from a specific folder, mention the folder name.
When there are many results, highlight the top 3-5 most relevant and mention how many total were found.
Always make URLs clickable using Markdown link syntax.

**Example - Tool Output:**
If the history shows:
  - User: "list tabs"
  - Tool Output: "[\"Google\", \"CNN\"]"
  
You should respond:
"Here are your open tabs:
- **Google**
- **CNN**"

**Example - General Question:**
User: "What is machine learning?"
You should respond with a clear, helpful explanation of machine learning.

Remember: You are a fully capable AI assistant. Help the user with whatever they need!`;

    // Debug: Log what messages the chat node receives
    console.log(
      `💬 Chat node received ${state.messages.length} messages:`,
      state.messages.map(
        (m: any) => `${m._getType()}: ${msgText(m).substring(0, 50)}...`
      )
    );

    // Check if the last message was a tool output or a user question
    const lastMsg = state.messages[state.messages.length - 1];
    const lastMsgText = msgText(lastMsg);
    const hasToolOutput = lastMsgText.includes("[Tool Output for");
    const hasSummarizeRequest = lastMsgText.includes("__SUMMARIZE_REQUEST__");
    
    // Append appropriate hidden instruction
    let hiddenInstruction: string;
    if (hasSummarizeRequest) {
      hiddenInstruction = `The content above is from a webpage that the user wants summarized. Please provide a clear, concise summary that:
1. Captures the main topic and key points
2. Uses bullet points for easy reading
3. Keeps it to 3-5 paragraphs max
4. Highlights any important facts, dates, or conclusions
Do NOT mention that you received page content or reference this instruction. Just provide the summary naturally.`;
    } else if (hasToolOutput) {
      hiddenInstruction = "The tool has provided the data above. Using that data, write a natural language response to the user's original request. Do NOT reference this instruction or the fact that you are using tool data.";
    } else {
      hiddenInstruction = "Please respond to the user's message naturally and helpfully. Do NOT reference this instruction.";
    }
    
    const messagesWithPrompt = [
      ...state.messages,
      new HumanMessage(hiddenInstruction),
    ];

    const res = await chatRemote(CHAT_PROMPT, toWire(messagesWithPrompt));
    return {
      messages: [new AIMessage((res as any).content)],
      lastWorker: "chat",
    };
  };

  const supervisorNode = async (s: typeof GraphState.State) => {
    const options = [END, ...memberNames, "chat", "FINISH"];
    const systemPrompt = systemTemplate
      .replace("{members}", memberNames.join(", "))
      .replace("{options}", options.join(", "));

    // Get the latest user message for keyword detection
    const latestUserMsg = [...s.messages].reverse().find(m => m._getType() === "human");
    const latestTextRaw = msgText(latestUserMsg) || "";
    const latestText = latestTextRaw.toLowerCase();
    const lines = latestTextRaw
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);
    const commandLine =
      lines.find(l =>
        /(tab\s*group|group|tabs?|bookmark|folder|window|search|memory)/i.test(l) &&
        /(delete|remove|create|make|new|add|list|open|close|rename|show|split|find|summarize)/i.test(l)
      ) || latestTextRaw;
    const commandText = commandLine.toLowerCase();
    
    // Check for confirmation keywords FIRST (before checking pending confirmation)
    // This allows confirm_action to run even when there's a pending confirmation
    // BUT: Don't route to confirm_action if we just ran it (prevents infinite loops)
    const justRanTool = memberNames.includes(s.lastWorker);
    const justRanConfirm = s.lastWorker === "confirm_action";
    
    const confirmationText = (lines[lines.length - 1] || latestTextRaw).trim();
    const confirmMatch = confirmationText.match(/^(?:yes|confirm|do\s+it|go\s+ahead|approve|ok|okay)$/i);
    const cancelMatch = confirmationText.match(/^(?:no|cancel|nevermind|don'?t|stop)$/i);
    
    if ((confirmMatch || cancelMatch) && !justRanConfirm) {
      // User is trying to confirm/cancel - route to confirm_action
      // But only if we didn't just run confirm_action (prevents loops)
      return {
        next: "confirm_action",
        args: { confirmed: !!confirmMatch },
      };
    }
    
    // If there's a pending confirmation but user didn't say yes/no, stop the graph
    const pending = getPendingConfirmation();
    if (pending) {
      console.log("⏸️ Pending confirmation detected, stopping graph for modal");
      return { next: END, args: {} };
    }
    
    // Pre-routing: Detect obvious browser commands by keywords BEFORE calling LLM
    // This prevents the LLM from getting confused by long conversation history
    // BUT: Skip pre-routing if we just ran a tool (to avoid loops when confirmation is needed)
    // (justRanTool was already declared above for confirmation check)
    let preRoutedNext: string | null = null;
    let preRoutedArgs: Record<string, any> = {};
    
    // Only do pre-routing if we didn't just run a tool (prevents infinite loops)
    // When a tool requires confirmation, it sets pending confirmation and returns END
    // The next supervisor call should detect pending confirmation and stop, not pre-route again
    if (!justRanTool) {
    
    // Tab group commands
    // Match "delete tab group NAME" or "delete group NAME" or "delete NAME group"
    const tabGroupMatch = commandText.match(/(?:delete|remove)\s+(?:tab\s+)?group\s+["']?([^"'\n\s]+(?:\s+[^"'\n\s]+)*)["']?\s*$/i) ||
                          commandText.match(/(?:delete|remove)\s+(?:the\s+)?["']?([^"'\n\s]+(?:\s+[^"'\n\s]+)*)["']?\s+(?:tab\s+)?group/i);
    if (tabGroupMatch) {
      preRoutedNext = "delete_tab_group";
      preRoutedArgs = { name: tabGroupMatch[1].trim() };
      console.log(`🎯 Pre-routing delete_tab_group with name: "${preRoutedArgs.name}"`);
    }
    
    const createGroupMatch = commandText.match(/(?:create|make|new)\s+(?:a\s+)?(?:new\s+)?(?:tab\s+)?(?:group|gorup)\s+(?:called\s+|named\s+)?["']?(.+)$/i);
    if (createGroupMatch && !preRoutedNext) {
      // Clean up the captured name - remove trailing words
      let groupName = createGroupMatch[1].trim();
      let openUrl: string | undefined;
      
      // Extract "and open X in it" pattern to get the URL
      const openInItMatch = groupName.match(/\s+and\s+(?:open|go\s+to)\s+(.+?)\s+(?:in\s+it|in\s+the\s+group|in\s+that\s+group|there)$/i);
      if (openInItMatch) {
        openUrl = openInItMatch[1].trim();
        groupName = groupName.replace(/\s+and\s+(?:open|go\s+to)\s+.+$/i, "").trim();
      }
      
      // Remove "and add/open X to/in it" patterns (fallback)
      groupName = groupName.replace(/\s+and\s+(?:add|open|put)\s+.+$/i, "").trim();
      // Remove common trailing phrases and quotes
      groupName = groupName.replace(/\s+(?:with|using|from|for)\s+.*$/i, "").trim();
      groupName = groupName.replace(/["']/g, "").trim();
      if (groupName) {
        preRoutedNext = "create_tab_group";
        preRoutedArgs = { name: groupName };
        if (openUrl) {
          preRoutedArgs.openUrl = openUrl;
        }
      }
      // Check for tab indices
      const indicesMatch = commandText.match(/(?:with\s+)?tabs?\s+([\d,\s]+(?:and\s+\d+)?)/i);
      if (indicesMatch) {
        const indices = indicesMatch[1].match(/\d+/g)?.map(Number) || [];
        if (indices.length > 0) preRoutedArgs.indices = indices;
      }
    }
    
    const listGroupsMatch = commandText.match(/list\s+(?:all\s+)?(?:tab\s+)?groups?/i);
    if (listGroupsMatch && !preRoutedNext) {
      preRoutedNext = "list_tab_groups";
      preRoutedArgs = {};
    }
    
    // Tab commands
    const listTabsMatch = commandText.match(/list\s+(?:all\s+)?(?:my\s+)?tabs?/i);
    if (listTabsMatch && !preRoutedNext) {
      preRoutedNext = "list_tabs";
      preRoutedArgs = {};
    }
    
    const openTabMatch = commandText.match(/open\s+(?:a\s+)?(?:new\s+)?tab\s+(?:to\s+|with\s+)?["']?([^\s"']+)["']?/i);
    if (openTabMatch && !preRoutedNext) {
      preRoutedNext = "open_tab";
      preRoutedArgs = { url: openTabMatch[1].trim() };
    }
    
    const closeTabMatch = commandText.match(/close\s+(?:the\s+)?(?:current\s+)?tab(?:\s+(\d+))?/i);
    if (closeTabMatch && !preRoutedNext) {
      preRoutedNext = "close_tab";
      preRoutedArgs = closeTabMatch[1] ? { index: parseInt(closeTabMatch[1]) } : {};
    }

    // Split view commands
    // Match "split tab 1 and 2" or "add tab 1 and 2 to split view" or "splitview tab 1 and tab 2"
    const twoTabsMatch = commandText.match(/(?:split|splitview|add)\s+(?:tabs?\s+)?(\d+)\s+(?:and|,|with)\s+(?:tab\s+)?(\d+)/i) ||
                         commandText.match(/(?:add\s+)?tabs?\s+(\d+)\s+(?:and|,|with)\s+(?:tab\s+)?(\d+)\s+(?:to\s+)?(?:split\s*view|splitview)/i);
    if (twoTabsMatch && !preRoutedNext) {
      preRoutedNext = "add_split_view";
      preRoutedArgs = { indices: [parseInt(twoTabsMatch[1]), parseInt(twoTabsMatch[2])] };
    }

    const addSplitViewMatch = commandText.match(/(?:add|create|enable)\s+split\s*view/i) ||
                              commandText.match(/split\s+(?:this\s+)?(?:tab|view)/i);
    if (addSplitViewMatch && !preRoutedNext) {
      preRoutedNext = "add_split_view";
      // Check if they specified a tab to split with
      const withTabMatch = commandText.match(/(?:with|and)\s+(?:tab\s+)?(\d+)/i);
      const withQueryMatch = commandText.match(/(?:with|and)\s+(?:the\s+)?["']?([^"'\d][^"']+?)["']?\s*(?:tab)?$/i);
      if (withTabMatch) {
        preRoutedArgs = { withIndex: parseInt(withTabMatch[1]) };
      } else if (withQueryMatch) {
        preRoutedArgs = { withQuery: withQueryMatch[1].trim() };
      } else {
        preRoutedArgs = {};
      }
    }

    const removeSplitViewMatch = commandText.match(/(?:remove|disable|close)\s+split\s*view/i) ||
                                  commandText.match(/unsplit\s+(?:tabs?|view)?/i);
    if (removeSplitViewMatch && !preRoutedNext) {
      preRoutedNext = "remove_split_view";
      preRoutedArgs = {};
    }

    // Summarize page command
    // Match "summarize current tab" or "summarize this tab" (current tab, no args needed)
    const summarizeCurrentTabMatch = commandText.match(/summarize\s+(?:the\s+)?(?:current|this|active)\s+tab/i);
    if (summarizeCurrentTabMatch && !preRoutedNext) {
      preRoutedNext = "summarize_page";
      preRoutedArgs = {};
    }
    
    // Match "summarize tab 1" or "summarize the first tab"
    const summarizeTabMatch = commandText.match(/summarize\s+(?:the\s+)?tab\s+(\d+)/i) ||
                              commandText.match(/summarize\s+(?:the\s+)?(?:first|1st)\s+tab/i);
    if (summarizeTabMatch && !preRoutedNext) {
      preRoutedNext = "summarize_page";
      const tabNum = summarizeTabMatch[1] ? parseInt(summarizeTabMatch[1]) : 1;
      preRoutedArgs = { index: tabNum };
    }
    
    // Match "summarize the Amazon tab" (but not "current/this/active tab")
    const summarizeQueryMatch = commandText.match(/summarize\s+(?:the\s+)?["']?([^"'\d][^"']+?)["']?\s*tab/i);
    if (summarizeQueryMatch && !preRoutedNext) {
      const queryText = summarizeQueryMatch[1].trim().toLowerCase();
      // Skip if it's "current", "this", or "active" - already handled above
      if (!["current", "this", "active"].includes(queryText)) {
        preRoutedNext = "summarize_page";
        preRoutedArgs = { query: queryText };
      }
    }
    
    const summarizeMatch = commandText.match(/summarize\s+(?:this\s+)?(?:page|article|website|site)?/i) ||
                           commandText.match(/(?:what\s+is|tell\s+me\s+about)\s+this\s+(?:page|article|website|site)/i) ||
                           commandText.match(/give\s+(?:me\s+)?(?:a\s+)?summary/i);
    if (summarizeMatch && !preRoutedNext) {
      preRoutedNext = "summarize_page";
      preRoutedArgs = {};
    }

    // Search memory commands
    // "search for X in my Y folder" or "find X in folder Y"
    const searchFolderMatch = commandText.match(/(?:search|find|look\s*up)\s+(?:for\s+)?(.+?)\s+(?:in\s+(?:my\s+)?(?:the\s+)?)([\w\s]+?)\s+folder/i) ||
                              commandText.match(/(?:search|find|look\s*up)\s+(?:in\s+(?:my\s+)?(?:the\s+)?)([\w\s]+?)\s+folder\s+(?:for\s+)?(.+)/i);
    if (searchFolderMatch && !preRoutedNext) {
      preRoutedNext = "search_memory";
      preRoutedArgs = { query: searchFolderMatch[1].trim(), folder: searchFolderMatch[2].trim() };
    }

    // "what did I save in my X folder" / "what's in my X folder"
    const whatInFolderMatch = commandText.match(/what(?:'s|\s+is|\s+did\s+i\s+save)\s+in\s+(?:my\s+)?(?:the\s+)?([\w\s]+?)\s+folder/i);
    if (whatInFolderMatch && !preRoutedNext) {
      preRoutedNext = "search_memory";
      preRoutedArgs = { query: "*", folder: whatInFolderMatch[1].trim() };
    }

    // "search for X" / "find X in my history/bookmarks" / "have I visited X" / "look up X"
    const searchMemoryMatch = commandText.match(/(?:search|find|look\s*up)\s+(?:for\s+)?(?:in\s+(?:my\s+)?(?:history|bookmarks?|memory|tabs?)\s+)?["']?(.+?)["']?\s*$/i) ||
                              commandText.match(/have\s+i\s+(?:visited|been\s+to|seen|saved|bookmarked)\s+(?:any\s+)?["']?(.+?)["']?\s*$/i) ||
                              commandText.match(/(?:do\s+i\s+have)\s+(?:any(?:thing)?\s+(?:about|on|related\s+to)\s+)?["']?(.+?)["']?\s*(?:saved|bookmarked|in\s+my)/i);
    if (searchMemoryMatch && !preRoutedNext) {
      preRoutedNext = "search_memory";
      preRoutedArgs = { query: searchMemoryMatch[1].trim() };
    }

    // Bookmark folder commands
    // Composite: "create folder X and add current tab / all tabs to it"
    const createFolderWithCurrentMatch = commandText.match(/(?:create|make|new)\s+(?:a\s+)?(?:new\s+)?(?:bookmark\s+)?folder\s+(?:called\s+|named\s+)?["']?([\w\s]+?)["']?\s+and\s+(?:add|save|include|put)\s+(?:the\s+)?(?:current|this|active)\s+tab/i);
    const createFolderWithAllMatch = commandText.match(/(?:create|make|new)\s+(?:a\s+)?(?:new\s+)?(?:bookmark\s+)?folder\s+(?:called\s+|named\s+)?["']?([\w\s]+?)["']?\s+and\s+(?:add|save|include|put)\s+(?:all)\s+tabs/i);
    if (createFolderWithCurrentMatch && !preRoutedNext) {
      preRoutedNext = "create_bookmark_folder";
      preRoutedArgs = { name: createFolderWithCurrentMatch[1].trim(), include: "current" };
    } else if (createFolderWithAllMatch && !preRoutedNext) {
      preRoutedNext = "create_bookmark_folder";
      preRoutedArgs = { name: createFolderWithAllMatch[1].trim(), include: "all" };
    }
    // Simple: "create folder X"
    const createFolderMatch = commandText.match(/(?:create|make|new)\s+(?:a\s+)?(?:new\s+)?(?:bookmark\s+)?folder\s+(?:called\s+|named\s+)?["']?([\w\s]+?)["']?\s*$/i);
    if (createFolderMatch && !preRoutedNext) {
      preRoutedNext = "create_bookmark_folder";
      preRoutedArgs = { name: createFolderMatch[1].trim() };
    }

    const deleteFolderMatch = commandText.match(/(?:delete|remove)\s+(?:the\s+)?(?:bookmark\s+)?folder\s+["']?([\w\s]+?)["']?\s*$/i) ||
                              commandText.match(/(?:delete|remove)\s+(?:the\s+)?["']?([\w\s]+?)["']?\s+(?:bookmark\s+)?folder/i);
    if (deleteFolderMatch && !preRoutedNext) {
      preRoutedNext = "delete_bookmark_folder";
      preRoutedArgs = { name: deleteFolderMatch[1].trim() };
    }

    const listFoldersMatch = commandText.match(/list\s+(?:all\s+)?(?:my\s+)?(?:bookmark\s+)?folders/i);
    if (listFoldersMatch && !preRoutedNext) {
      preRoutedNext = "list_bookmark_folders";
      preRoutedArgs = {};
    }

    const addToFolderMatch = commandText.match(/(?:save|add)\s+(?:this\s+)?(?:tab\s+)?(?:to\s+(?:my\s+)?(?:the\s+)?)(?:bookmark\s+)?folder\s+["']?([\w\s]+?)["']?\s*$/i) ||
                             commandText.match(/(?:save|add)\s+(?:this\s+)?(?:tab\s+)?(?:to\s+(?:my\s+)?(?:the\s+)?)["']?([\w\s]+?)["']?\s*$/i);
    if (addToFolderMatch && !preRoutedNext) {
      preRoutedNext = "add_tab_to_bookmark_folder";
      preRoutedArgs = { name: addToFolderMatch[1].trim() };
    }

    const renameFolderMatch = commandText.match(/rename\s+(?:the\s+)?(?:bookmark\s+)?folder\s+["']?([\w\s]+?)["']?\s+(?:to|as)\s+["']?([\w\s]+?)["']?\s*$/i);
    if (renameFolderMatch && !preRoutedNext) {
      preRoutedNext = "rename_bookmark_folder";
      preRoutedArgs = { from: renameFolderMatch[1].trim(), to: renameFolderMatch[2].trim() };
    }

    const openFolderMatch = commandText.match(/open\s+(?:the\s+)?(?:my\s+)?(?:bookmark\s+)?folder\s+["']?([\w\s]+?)["']?\s*$/i) ||
                            commandText.match(/open\s+(?:my\s+)?["']?([\w\s]+?)["']?\s+(?:bookmark\s+)?folder\s*$/i);
    // "open folder X in a new window" / "open folder X as/in a tab group"
    const openFolderWhereMatch = commandText.match(/open\s+(?:the\s+)?(?:my\s+)?(?:bookmark\s+)?folder\s+["']?([\w\s]+?)["']?\s+(?:in\s+(?:a\s+)?(?:new\s+)?window)/i) ||
                                 commandText.match(/open\s+(?:my\s+)?["']?([\w\s]+?)["']?\s+(?:bookmark\s+)?folder\s+(?:in\s+(?:a\s+)?(?:new\s+)?window)/i);
    const openFolderTabGroupMatch = commandText.match(/open\s+(?:the\s+)?(?:my\s+)?(?:bookmark\s+)?folder\s+["']?([\w\s]+?)["']?\s+(?:(?:as|in)\s+(?:a\s+)?(?:new\s+)?tab\s*group)/i) ||
                                    commandText.match(/open\s+(?:my\s+)?["']?([\w\s]+?)["']?\s+(?:bookmark\s+)?folder\s+(?:(?:as|in)\s+(?:a\s+)?(?:new\s+)?tab\s*group)/i);
    if (openFolderTabGroupMatch && !preRoutedNext) {
      preRoutedNext = "open_bookmark_folder";
      preRoutedArgs = { name: openFolderTabGroupMatch[1].trim(), where: "tabgroup" };
    } else if (openFolderWhereMatch && !preRoutedNext) {
      preRoutedNext = "open_bookmark_folder";
      preRoutedArgs = { name: openFolderWhereMatch[1].trim(), where: "window" };
    } else if (openFolderMatch && !preRoutedNext) {
      preRoutedNext = "open_bookmark_folder";
      preRoutedArgs = { name: openFolderMatch[1].trim() };
    }

    } // End of !justRanTool check
    
    // If pre-routing matched, use it directly
    if (preRoutedNext) {
      console.log(`🎯 Pre-routed to ${preRoutedNext} with args:`, preRoutedArgs);
      return { next: preRoutedNext, args: preRoutedArgs };
    }

    const out = await routeRemote(systemPrompt, toWire(s.messages), options);
    const nextTool = (out as any)?.next;
    const nextArgs = (out as any)?.args || {};

    // CHECK: If the tool just finished and the LLM tries to call it again, force to chat
    // We use s.lastWorker to know if the IMMEDIATE previous step was a specific tool.
    // (justRanTool was already declared above for pre-routing check)

    console.log(
      `🕵️ Supervisor Check: lastWorker=${s.lastWorker}, justRanTool=${justRanTool}, nextTool=${nextTool}`
    );

    if (justRanTool && nextTool === s.lastWorker) {
      console.log(
        `🛑 Stopping recursion: ${nextTool} repeated immediately after output.`
      );
      return { next: "chat", args: {} };
    }

    // Handle explicit completion
    if (nextTool === "FINISH" || nextTool === END) {
      // If the last action was a tool output, we MUST summarize it for the user via 'chat'
      // instead of just ending silently (which leads to raw JSON fallback).
      if (justRanTool) {
        console.log("📝 Redirecting to 'chat' node to format tool output.");
        return { next: "chat", args: {} };
      }
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
    // Use conditional edges so tool nodes can route to END (for confirmations) or supervisor
    workflow.addConditionalEdges(
      name as any,
      (x: typeof GraphState.State) => x.next || "supervisor"
    );
  }
  workflow.addNode("chat", chatNode);
  workflow.addEdge("chat" as any, END as any);
  workflow.addNode("supervisor", supervisorNode);
  workflow.addConditionalEdges(
    "supervisor" as any,
    (x: typeof GraphState.State) => x.next
  );
  workflow.addEdge(START, "supervisor" as any);

  return workflow.compile();
}

// ---------- Public APIs ----------

// Streaming variant used by the UI for live updates
export async function runAssistantStream(
  prompt: string,
  onChunk: (text: string) => void,
  inputType: "text" | "voice" = "text", // Add inputType parameter
  messageId?: string
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
    // Split View (side-by-side tabs in same window)
    new AddSplitViewCommand(),
    new RemoveSplitViewCommand(),
    // Bookmark Folders (Persistent)
    new CreateBookmarkFolderCommand(),
    new DeleteBookmarkFolderCommand(),
    new ListBookmarkFoldersCommand(),
    new RenameBookmarkFolderCommand(),
    new AddTabToBookmarkFolderCommand(),
    new RemoveTabFromBookmarkFolderCommand(),
    new OpenBookmarkFolderCommand(),
    // Tab Groups (Visual Grouping - Current Window)
    new ListTabGroupsCommand(),
    new CreateTabGroupCommand(),
    new DeleteTabGroupCommand(),
    new AddTabToGroupCommand(),
    new RemoveTabFromGroupCommand(),
    new RenameTabGroupCommand(),
    // Confirmation
    new ConfirmActionCommand(),
    // Other
    new NewWindowCommand(),
    new OrganizeWindowsCommand(),
    new ShowURLCommand(),
    new SearchMemoryCommand(),
    new SummarizePageCommand(),
    new ShowSubscriptionCommand(),
  ];
  const graph = await buildGraph(commands, messageId);

  // Get conversation history for context - automatically managed
  const sessionHistory = getCurrentSessionMessages();

  // Debug: Log how many messages are in context
  console.log(
    `📚 Session context: ${sessionHistory.length} messages in history`
  );

  const stream = await graph.stream(
    { messages: [...sessionHistory, new HumanMessage({ content: prompt })] },
    { recursionLimit: 32 }
  );

  let combinedSessionString = "";
  let isSaved = false;
  let stepCount = 0;
  let hasEmittedUserMessage = false;

  for await (const state of stream as any) {
    stepCount++;
    console.log(`🔄 Stream step ${stepCount}, keys:`, Object.keys(state));

    if ("__end__" in state) {
      console.log(
        `🔚 Stream ended. combined length: ${combinedSessionString.length}`
      );
      if (combinedSessionString && !isSaved) {
        console.log(
          `✅ Saving turn to session: "${prompt}" -> "${combinedSessionString.substring(0, 50)}..."`
        );
        pushCurrentTurn(prompt, combinedSessionString);
        subscriptionService.trackUsage(inputType);
        isSaved = true;
      }
      break;
    }
    const step = Object.entries(state).find(([k]) => k !== "__end");
    console.log(`🔍 Step details:`, {
      stepKey: step?.[0],
      stepValue: step?.[1],
      hasMessages: step?.[1] && "messages" in (step[1] as any),
      stepKeys: step?.[1] ? Object.keys(step[1] as any) : [],
    });

    if (step?.[1] && "messages" in (step[1] as any)) {
      const messages = (step[1] as any).messages;
      console.log(
        `📨 Processing ${messages.length} messages from step:`,
        step[0]
      );

      // Process all messages, not just the last one
      for (const msg of messages) {
        let text = "";

        // Improved text extraction with better logging
        if (typeof msg?.content === "string") {
          text = msg.content;
        } else if (Array.isArray(msg?.content)) {
          text = msg.content
            .map((c: any) => {
              if (typeof c === "string") return c;
              if (c?.text) return c.text;
              if (c?.type === "text" && c.text) return c.text;
              return String(c || "");
            })
            .join("");
        } else if (msg?.content != null) {
          text = String(msg.content);
        }

        const msgType = msg?.getType?.() || msg?.constructor?.name || "unknown";
        console.log(`📝 Extracted text from message (${msgType}):`, {
          textLength: text.length,
          textPreview: text.substring(0, 100),
          contentType: typeof msg?.content,
          isArray: Array.isArray(msg?.content),
        });

        if (text) {
          // Filter out tool output messages from UI display (but keep in session for supervisor)
          const isToolOutput = text.includes("[Tool Output for");

          if (!isToolOutput) {
            // Since our nodes return complete messages (not streaming tokens),
            // we can just append and emit.
            // Note: If we had token streaming, we'd need per-message buffering.
            // For now, assume atomic messages.
            const newContent = text + "\n";
            console.log(`📤 Emitting chunk to UI:`, {
              length: newContent.length,
              preview: newContent.substring(0, 50),
            });
            onChunk(newContent);
            combinedSessionString += newContent;
            hasEmittedUserMessage = true;
          } else {
            // Still add to session string for supervisor context, but don't display to user
            console.log(
              `🔧 Tool output (hidden from UI):`,
              text.substring(0, 50)
            );
            combinedSessionString += text + "\n";
          }
        }
      }
    }
  }
  console.log(
    `🏁 Stream finished. Final combined length: ${combinedSessionString.length}, hasEmittedUserMessage: ${hasEmittedUserMessage}`
  );

  // If we only have tool output and no user-facing message was emitted, extract and format it
  if (
    !hasEmittedUserMessage &&
    combinedSessionString &&
    combinedSessionString.includes("[Tool Output for")
  ) {
    const toolOutputMatch = combinedSessionString.match(
      /\[Tool Output for [^\]]+\]:\s*(.+)/s
    );
    if (toolOutputMatch && toolOutputMatch[1]) {
      const toolMessage = toolOutputMatch[1].trim();
      console.log(
        `📋 Extracting user-friendly message from tool output:`,
        toolMessage.substring(0, 100)
      );
      // Format it as if the AI said it - capitalize first letter
      const friendlyMessage =
        toolMessage.charAt(0).toUpperCase() + toolMessage.slice(1) + "\n";
      onChunk(friendlyMessage);
      combinedSessionString = friendlyMessage;
    }
  }

  // SAFETY: Always save the turn even if we didn't hit __end__
  if (combinedSessionString && !isSaved) {
    console.log(
      `✅ Saving turn to session (post-stream): "${prompt}" -> "${combinedSessionString.substring(0, 50)}..."`
    );
    pushCurrentTurn(prompt, combinedSessionString);
    subscriptionService.trackUsage(inputType);
  }

  return combinedSessionString || "(no output)";
}
(window as any).runAssistantStream = runAssistantStream;
