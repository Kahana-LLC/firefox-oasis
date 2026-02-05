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
Your job is to intelligently route the user's request to the appropriate worker.
You will be given the user's request and the conversation history.

**Workers**
You have the following workers available:
{members}

**IMPORTANT: Hubs vs Tab Groups**
- **Hubs** are BOOKMARK FOLDERS that persist across sessions. Use hub commands (create_hub, add_tab_to_hub, etc.) for saving/organizing bookmarks.
- **Tab Groups** are VISUAL groupings of open tabs that exist only in the current window. Use tab group commands (create_tab_group, add_tab_to_group, etc.) for organizing currently open tabs visually.

**Worker Arguments**

*Tab Commands:*
- **list_tabs**: No arguments needed
- **open_tab**: { url: string } - the website URL to open
- **close_tab**: { index?: number } - OPTIONAL 1-based tab number. REQUIRES CONFIRMATION.
- **move_tab_to_new_window**: { index?: number } - OPTIONAL 1-based tab number
- **copy_tab_urls**: No arguments needed
- **split_tabs**: { indices: [number, number, ...] } - split tabs into side-by-side windows

*Hub Commands (Bookmark Folders - Persistent):*
- **create_hub**: { name: string, include?: "none"|"current"|"all" } - create bookmark folder
- **delete_hub**: { name: string, closeTabs?: boolean } - REQUIRES CONFIRMATION
- **list_hubs**: No arguments needed
- **rename_hub**: { from: string, to: string }
- **add_tab_to_hub**: { name: string } - add current tab as bookmark to hub
- **remove_tab_from_hub**: { name: string, url?: string }
- **open_hub**: { name: string, where?: "tabs"|"window" } - open all bookmarks from hub

*Tab Group Commands (Visual Grouping - Current Window Only):*
- **list_tab_groups**: No arguments needed - list visual tab groups
- **create_tab_group**: { name: string, indices?: number[] } - create visual group from tabs
- **delete_tab_group**: { name: string, closeTabs?: boolean } - REQUIRES CONFIRMATION
- **add_tab_to_group**: { name: string, query?: string, index?: number, all?: boolean } - add tab(s) to visual group. Use 'all: true' to add ALL ungrouped tabs. Use 'query' to find specific tab by name. Examples: "add all tabs to Work" → { name: "Work", all: true }. "add Reddit to streaming" → { name: "streaming", query: "Reddit" }.
- **remove_tab_from_group**: { index?: number } - ungroup a tab
- **rename_tab_group**: { from: string, to: string } - rename a visual tab group

*Other Commands:*
- **new_window**: No arguments needed
- **organize_windows**: No arguments needed
- **show_url**: { url: string }
- **search_memory**: { query: string, hub?: string }
- **confirm_action**: { confirmed: boolean } - confirm or cancel a pending action

**Confirmation Handling**
Some commands require user confirmation before executing (close_tab, delete_hub, delete_tab_group).
When a user says "yes", "confirm", "do it", "go ahead" after a confirmation request, use: { "next": "confirm_action", "args": { "confirmed": true } }
When a user says "no", "cancel", "nevermind", use: { "next": "confirm_action", "args": { "confirmed": false } }

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

**Examples**
User: "Open a new tab to google.com"
→ { "next": "open_tab", "args": { "url": "google.com" } }

User: "Close tab 3"
→ { "next": "close_tab", "args": { "index": 3 } }
(After confirmation request) User: "yes"
→ { "next": "confirm_action", "args": { "confirmed": true } }

User: "Group my first 3 tabs as Work"
→ { "next": "create_tab_group", "args": { "name": "Work", "indices": [1, 2, 3] } }

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

User: "Save this tab to my Research hub"
→ { "next": "add_tab_to_hub", "args": { "name": "Research" } }

User: "Rename tab group Work to Projects"
→ { "next": "rename_tab_group", "args": { "from": "Work", "to": "Projects" } }

The available workers are: {options}`.trim();

  const chatNode = async (state: typeof GraphState.State) => {
    const CHAT_PROMPT = `You are a helpful Firefox browser assistant with full conversation memory.

**Important:** You have access to the complete conversation history, including:
- All previous user requests
- Commands that were executed (marked as [Tool Output for ...])
- Results from those commands

**Response Guidelines:**
1. **Use Markdown:** Format your answers beautifully using Markdown.
   - Use **bold** for key terms or emphasis.
   - Use bullet points or numbered lists for summarizing multiple items (like open tabs).
   - Use \`code blocks\` for URLs, technical terms, or specific values.
2. **Interpret Data:** If a tool returns raw data (like JSON arrays or objects), you **MUST** format it into a human-readable list or sentence. NEVER output raw JSON to the user.
3. **Context Aware:** You can see everything that happened in this conversation - use that context!
4. **Natural Tone:** Do NOT mention the internal workings, "tool outputs", or that you are using data from a previous step. Just provide the answer naturally.

**When answering questions:**
1. If asked to summarize or recall: Review the conversation history and list what happened clearly.
2. If asked general questions: Answer helpfully based on what you know.

**Example:**
If the history shows:
  - User: "list tabs"
  - Tool Output: "[\"Google\", \"CNN\"]"
  
You should respond:
"Here are your open tabs:
- **Google**
- **CNN**"

Remember: You ARE stateful within this conversation. The history is right there in your context!`;

    // Debug: Log what messages the chat node receives
    console.log(
      `💬 Chat node received ${state.messages.length} messages:`,
      state.messages.map(
        (m: any) => `${m._getType()}: ${msgText(m).substring(0, 50)}...`
      )
    );

    // FORCE the LLM to reply by appending a hidden instruction
    // otherwise it sees "Model: [Tool Output]" and thinks it's done.
    const messagesWithPrompt = [
      ...state.messages,
      new HumanMessage(
        "The tool has provided the data above. Using that data, write a natural language response to the user's original request. Do NOT reference this instruction or the fact that you are using tool data."
      ),
    ];

    const res = await chatRemote(CHAT_PROMPT, toWire(messagesWithPrompt));
    return {
      messages: [new AIMessage(res.content)],
      lastWorker: "chat",
    };
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
    // We use s.lastWorker to know if the IMMEDIATE previous step was a specific tool.
    const justRanTool = memberNames.includes(s.lastWorker);

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
    workflow.addEdge(name as any, "supervisor" as any);
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
    // Hubs (Bookmark Folders - Persistent)
    new CreateHubCommand(),
    new DeleteHubCommand(),
    new ListHubsCommand(),
    new RenameHubCommand(),
    new AddTabToHubCommand(),
    new RemoveTabFromHubCommand(),
    new OpenHubCommand(),
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
