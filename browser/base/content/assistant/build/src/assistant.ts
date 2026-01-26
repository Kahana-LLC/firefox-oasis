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
  ReloadTabCommand,
  MuteTabCommand,
  PinTabCommand,
  DuplicateTabCommand,
  ReopenClosedTabCommand,
  GroupTabsCommand,
  UngroupTabsCommand,
  ListTabGroupsCommand,
  RenameTabGroupCommand,
  CollapseTabGroupCommand,
  DeleteTabGroupCommand,
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

/* ========= Human-in-the-Loop Configuration ========= */
const SENSITIVE_COMMANDS = new Set([
  "close_tab",
  "delete_hub",
  "delete_tab_group",
  "split_tabs",
  "move_tab_to_new_window",
]);

export interface ApprovalRequest {
  command: string;
  args: Record<string, any>;
  description: string;
}

function getApprovalMessage(command: string, args: Record<string, any>): string {
  switch (command) {
    case "close_tab":
      return args.index
        ? `Close tab #${args.index}?`
        : "Close the current tab?";
    case "delete_hub":
      return `Delete hub "${args.name}"${args.closeTabs ? " and close its tabs" : ""}?`;
    case "delete_tab_group":
      return args.name
        ? `Delete tab group "${args.name}"? (Tabs will be ungrouped, not closed)`
        : `Delete tab group #${args.index}? (Tabs will be ungrouped, not closed)`;
    case "split_tabs":
      return `Split tabs ${args.indices?.join(", ")} into separate windows?`;
    case "move_tab_to_new_window":
      return args.index
        ? `Move tab #${args.index} to a new window?`
        : "Move current tab to a new window?";
    default:
      return `Execute ${command}?`;
  }
}

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
  pendingCommand: Annotation<string>({
    reducer: (x, y) => y ?? x ?? "",
    default: () => "",
  }),
  approvalStatus: Annotation<"pending" | "approved" | "rejected" | null>({
    reducer: (x, y) => y ?? x ?? null,
    default: () => null,
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
async function buildGraph(
  commands: Command[],
  approvalCallback?: ApprovalCallback
) {
  const toolAgents: Record<string, any> = {};
  const memberNames: string[] = [];

  for (const command of commands) {
    const node = async (state: typeof GraphState.State) => {
      console.log(`🏷️ Executing ${command.commandName} with args:`, state.args);

      const result: CmdResult = await command.execute(state.args);
      const content = `[Tool Output for ${command.commandName}]: ${result.message}`;

      return {
        messages: [new AIMessage({ content, name: command.commandName })],
        lastWorker: "",
        repeatCount: 0,
        args: {},
        pendingCommand: "",
        approvalStatus: null,
      };
    };

    toolAgents[command.commandName] = node;
    memberNames.push(command.commandName);
  }

  const systemTemplate = `You are a supervisor agent that manages a team of workers.
Your job is to intelligently route the user's request to the appropriate worker.
You will be given the user's request and the conversation history.

**Workers**
You have the following workers available:
{members}

**Worker Arguments**

Tab Operations:
- **list_tabs**: No arguments needed
- **open_tab**: { url: string } - the website URL to open
- **close_tab**: { index?: number } - OPTIONAL 1-based tab number (e.g., "close tab 2" = { index: 2 }). If no index, closes active tab.
- **move_tab_to_new_window**: { index?: number } - OPTIONAL 1-based tab number
- **copy_tab_urls**: No arguments needed
- **split_tabs**: { indices: [number, number, ...] } - split tabs into side-by-side windows (e.g., "split tab 1 and 2" = { indices: [1, 2] })
- **reload_tab**: { index?: number } - reload a tab (current tab if no index)
- **mute_tab**: { index?: number, mute?: boolean } - mute/unmute a tab (toggles if mute not specified)
- **pin_tab**: { index?: number, pin?: boolean } - pin/unpin a tab (toggles if pin not specified)
- **duplicate_tab**: { index?: number } - duplicate a tab
- **reopen_closed_tab**: No arguments - reopens the most recently closed tab
- **new_window**: No arguments needed
- **organize_windows**: No arguments needed
- **show_url**: { url: string }

Tab Group Operations (visual browser tab groups):
- **group_tabs**: { indices: [number, ...], groupName?: string } - add tabs to a new group (e.g., "group tabs 2 and 3" = { indices: [2, 3] })
- **ungroup_tabs**: { indices: [number, ...] } - remove tabs from their group
- **list_tab_groups**: No arguments - list all tab groups
- **rename_tab_group**: { from: string, to: string } or { index: number, to: string } - rename a tab group
- **collapse_tab_group**: { name?: string, index?: number, collapse?: boolean } - collapse/expand a tab group
- **delete_tab_group**: { name?: string, index?: number } - delete a tab group (ungroups tabs, doesn't close them)

Bookmark Folder (Hub) Operations - NOTE: Hubs are BOOKMARK FOLDERS for saving URLs, NOT tab groups:
- **create_hub**: { name: string, include?: "none"|"current"|"all" } - creates a BOOKMARK FOLDER to save URLs
- **delete_hub**: { name: string, closeTabs?: boolean } - deletes a bookmark folder
- **list_hubs**: No arguments needed - lists bookmark folders
- **rename_hub**: { from: string, to: string }
- **add_tab_to_hub**: { name: string } - bookmarks the current tab into a folder
- **open_hub**: { name: string, where?: "tabs"|"window" } - opens bookmarks from a folder

Search:
- **search_memory**: { query: string, hub?: string } - search for keywords in bookmarks/hubs

**IMPORTANT**: When user says "group tabs", use **group_tabs** for visual tab groups. Only use **create_hub** when user explicitly wants to save/bookmark URLs.

**Rules**
1. **Analyze History:** Messages starting with \`[Tool Output for ...]\` are the results of a worker's action.
2. **Extract Arguments:** Convert tab numbers to 1-based indexes.
3. **Check for Completion:** If the user's request is already satisfied by the latest tool output, choose "FINISH".
4. **Handle Multi-Step:** If the user says "do X then Y", route step-by-step based on tool outputs.
5. **Chat:** If the user is asking a question, requesting an explanation, asking for information, or being conversational (hello/thanks/what is X/explain Y/tell me about Z/etc), choose "chat". The AI can answer general knowledge questions directly.
6. **Handle Failures:** If a tool returns an error or "No matches found", do NOT retry—choose "chat" to respond to the user.
7. **Default Action:** Otherwise choose the best worker for the most recent request.
8. **Never FINISH without response:** Do NOT choose "FINISH" unless a tool successfully completed the user's request. If the user asked a question, always route to "chat" to answer it.

**Output Format**
You MUST respond with a JSON object:
\`\`\`json
{ "next": "<worker>", "args": { ... } }
\`\`\`

The available workers are: {options}`.trim();

  const chatNode = async (state: typeof GraphState.State) => {
    if (state.approvalStatus === "rejected") {
      const cancelledCmd = state.pendingCommand || "that action";
      return {
        messages: [new AIMessage({
          content: `Okay, I won't ${cancelledCmd}. Is there anything else I can help with?`
        })],
        pendingCommand: "",
        approvalStatus: null,
      };
    }

    const CHAT_PROMPT = `You are a helpful Firefox browser assistant.

**Context you receive**
- You receive the messages passed into this graph run (which may be minimal).
- Messages that start with "[Tool Output for ...]" indicate executed commands and their results.

**How to respond**
- If the user is asking a normal question, answer helpfully.
- If the user is asking what happened in this run, summarize using the tool outputs provided.
- Keep responses concise and action-oriented.`;

    console.log(
      `💬 Chat node received ${state.messages.length} messages:`,
      state.messages.map((m: any) => `${m._getType()}: ${msgText(m).substring(0, 50)}...`)
    );

    const res = await chatRemote(CHAT_PROMPT, toWire(state.messages));
    return { messages: [new AIMessage(res.content)] };
  };

  const humanApprovalNode = async (state: typeof GraphState.State) => {
    const command = state.pendingCommand;
    const args = state.args || {};

    if (!SENSITIVE_COMMANDS.has(command)) {
      return { approvalStatus: "approved" as const };
    }

    const description = getApprovalMessage(command, args);
    console.log(`🛑 Human approval required for ${command}:`, description);

    if (approvalCallback) {
      const approved = await approvalCallback({ command, args, description });
      if (approved) {
        console.log(`✅ User approved ${command}`);
        return { approvalStatus: "approved" as const };
      } else {
        console.log(`❌ User rejected ${command}`);
        return {
          approvalStatus: "rejected" as const,
          next: "chat",
        };
      }
    }

    console.warn("No approval callback provided, auto-rejecting sensitive command");
    return {
      approvalStatus: "rejected" as const,
      next: "chat",
    };
  };

  const recentlyExecutedCommands = new Set<string>();

  const supervisorNode = async (s: typeof GraphState.State) => {
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
        return { next: "chat", args: {} };
      }

      recentlyExecutedCommands.add(commandSignature);

      if (recentlyExecutedCommands.size > 10) {
        const entries = Array.from(recentlyExecutedCommands);
        recentlyExecutedCommands.clear();
        entries.slice(-10).forEach(cmd => recentlyExecutedCommands.add(cmd));
      }

      if (SENSITIVE_COMMANDS.has(nextTool)) {
        return {
          next: "human_approval",
          pendingCommand: nextTool,
          args: nextArgs,
        };
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

  workflow.addNode("human_approval", humanApprovalNode);
  workflow.addConditionalEdges("human_approval" as any, (state: typeof GraphState.State) => {
    if (state.approvalStatus === "approved") {
      return state.pendingCommand;
    }
    return "chat";
  });

  workflow.addNode("supervisor", supervisorNode);
  workflow.addConditionalEdges("supervisor" as any, (x: typeof GraphState.State) => x.next);
  workflow.addEdge(START, "supervisor" as any);

  return workflow.compile();
}

// ---------- Public APIs ----------

export type ApprovalCallback = (request: ApprovalRequest) => Promise<boolean>;

export async function runAssistantStream(
  prompt: string,
  onChunk: (text: string) => void,
  onApprovalRequest?: ApprovalCallback
): Promise<string> {
  const isAuthenticated = await supabaseAuth.isAuthenticated();
  if (!isAuthenticated) {
    const msg = "Please sign in to use the assistant.";
    onChunk(msg);
    return msg;
  }

  const commands: Command[] = [
    new ListTabsCommand(),
    new OpenTabCommand(),
    new CloseTabCommand(),
    new MoveTabToNewWindowCommand(),
    new CopyTabUrlsCommand(),
    new SplitTabsCommand(),
    new ReloadTabCommand(),
    new MuteTabCommand(),
    new PinTabCommand(),
    new DuplicateTabCommand(),
    new ReopenClosedTabCommand(),
    new GroupTabsCommand(),
    new UngroupTabsCommand(),
    new ListTabGroupsCommand(),
    new RenameTabGroupCommand(),
    new CollapseTabGroupCommand(),
    new DeleteTabGroupCommand(),
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

  const graph = await buildGraph(commands, onApprovalRequest);

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
        let delta = text.startsWith(lastFull) ? text.slice(lastFull.length) : text;

        // Add newline separator between tool outputs for readability
        if (delta.includes("[Tool Output for") && lastFull.includes("[Tool Output for")) {
          delta = "\n\n" + delta;
          console.log(`📝 Adding newline separator between tool outputs`);
        }

        onChunk(delta);
        lastFull = text;
        console.log(`📝 Updated lastFull, length now: ${lastFull.length}`);
      }
    }
  }

  console.log(`🏁 Stream finished. Final lastFull length: ${lastFull.length}`);

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

export { SENSITIVE_COMMANDS };
