import { Annotation, END, START, StateGraph } from "@langchain/langgraph/web";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { SystemMessage, HumanMessage, BaseMessage, AIMessage } from "@langchain/core/messages";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { DynamicTool } from "@langchain/core/tools";
import { z } from "zod";
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

// ========= Ephemeral, in-memory chat history (per session) =========
const SESSIONS = new Map<string, BaseMessage[]>();
const MAX_TURNS = 12; // keep last N user/assistant turns (each turn = 2 messages)

function getSessionMessages(sessionId: string) {
  if (!SESSIONS.has(sessionId)) SESSIONS.set(sessionId, []);
  return SESSIONS.get(sessionId)!;
}

function pushTurn(sessionId: string, userText: string, assistantText: string) {
  const msgs = getSessionMessages(sessionId);
  msgs.push(new HumanMessage(userText));
  msgs.push(new AIMessage(assistantText));
  const maxMsgs = MAX_TURNS * 2;
  if (msgs.length > maxMsgs) msgs.splice(0, msgs.length - maxMsgs);
}

export function resetAssistantSession(sessionId = "default") {
  SESSIONS.delete(sessionId);
}

export function getAssistantHistory(sessionId = "default"): BaseMessage[] {
  return [...(SESSIONS.get(sessionId) || [])];
}

// ========= Baked secrets / config =========
const googleApiKey = process.env.GOOGLE_API_KEY as string;
if (!googleApiKey) throw new Error("GOOGLE_API_KEY was not baked into the bundle.");

// ========= Graph state (with repeat loop guard) =========
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

// ========= Build the graph (one LLM supervisor + one node per tool) =========
async function buildGraph(commands: Command[]) {
  const llm = new ChatGoogleGenerativeAI({
    apiKey: googleApiKey,
    model: "gemini-2.0-flash",
    temperature: 0.3,
    maxOutputTokens: 150,
    // @ts-ignore
    timeout: 30000,
    // @ts-ignore
    maxRetries: 2,
  });

  const toolAgents: Record<string, any> = {};
  const memberNames: string[] = [];

  // One tiny agent per command (executes the JS tool; returns AIMessage)
  for (const command of commands) {
    const tool = new DynamicTool({
      name: command.commandName,
      description: command.description,
      func: async (input: any) => {
        const res: CmdResult = await command.execute(input);
        return res.message;
      },
    });

    const agent = createReactAgent({
      llm,
      tools: [tool],
      stateModifier: new SystemMessage(
        `You are responsible for "${command.commandName}". ${command.description}
         Receive structured input; execute with your tool; return only the result text.
         If params are missing, say what is needed.`
      ),
    });

    const node = async (state: typeof GraphState.State) => {
      const result = await agent.invoke(state);
      const last = result.messages[result.messages.length - 1];

      // Normalize to plain text
      const text =
        typeof last?.content === "string"
          ? last.content
          : Array.isArray(last?.content)
          ? last.content.map((c: any) => (typeof c === "string" ? c : c?.text || "")).join("")
          : String(last?.content ?? "");

      const nextRepeat =
        state.lastWorker === command.commandName ? (state.repeatCount ?? 0) + 1 : 1;

      return {
        // Important for Gemini: AIMessage so author="model", no custom name
        messages: [new AIMessage(text)],
        lastWorker: command.commandName,
        repeatCount: nextRepeat,
      };
    };

    toolAgents[command.commandName] = node;
    memberNames.push(command.commandName);
  }

  // ---------- Supervisor with routing rules + few-shots ----------
  const ROUTING_GUIDELINES = `
Pick exactly ONE next worker from {options}. If the task needs multiple steps,
choose the earliest step first; you'll be invoked again after that worker runs.

Route by intent:
- open/go/navigate to a URL or site name → open_tab
- list/show current tabs → list_tabs
- close the current tab or "tab N" → close_tab
- move/detach a tab to a new window → move_tab_to_new_window
- copy/export/share/collect all tab URLs → copy_tab_urls

Ambiguity:
- If uncertain, prefer list_tabs (do NOT open sites on guesses).
- If the user asks for something you can't do, FINISH.

After a worker reports success (often a message stating the action it did),
choose FINISH unless the user explicitly asked for another action.
`.trim();

  const ROUTING_FEWSHOTS: Array<{ user: string; next: string }> = [
    { user: "show my tabs", next: "list_tabs" },
    { user: "what tabs do I have open?", next: "list_tabs" },
    { user: "open https://example.com", next: "open_tab" },
    { user: "go to mozilla.org", next: "open_tab" },
    { user: "close this tab", next: "close_tab" },
    { user: "close tab 3", next: "close_tab" },
    { user: "move this tab to a new window", next: "move_tab_to_new_window" },
    { user: "detach tab 2", next: "move_tab_to_new_window" },
    { user: "copy all tab urls", next: "copy_tab_urls" },
    { user: "export my open links", next: "copy_tab_urls" },
    { user: "open github and put it in a new window", next: "open_tab" }, // multi-step: open → move
    { user: "can you help with my tabs?", next: "list_tabs" },            // ambiguity → safe default
  ];

  const FEWSHOTS_TEXT = ROUTING_FEWSHOTS
    .filter(e => memberNames.includes(e.next))
    .map(e => `- "${e.user}" → ${e.next}`)
    .join("\n");

  const systemPrompt =
`You are a supervisor managing these workers: {members}.
Given the user request, choose who should act next. Use FINISH if done.

${ROUTING_GUIDELINES}

Routing examples:
${FEWSHOTS_TEXT}`.trim();

  const routingTool = {
    name: "route",
    description: "Select the next role.",
    schema: z.object({ next: z.enum([END, ...memberNames]) }),
  };

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    new MessagesPlaceholder("messages"),
    ["human", "Who should act next? Or FINISH? Choose one of: {options}"],
  ]);

  const formattedPrompt = await prompt.partial({
    options: [END, ...memberNames].join(", "),
    members: memberNames.join(", "),
  });

  const supervisorChain = formattedPrompt
    .pipe((llm as any).bindTools([routingTool], { tool_choice: "route" }))
    .pipe((x: any) => {
      if (!x.tool_calls || x.tool_calls.length === 0) throw new Error("No tool_calls from supervisor.");
      return x.tool_calls[0].args;
    });

  // Repeat guard only (no forced FINISH on success so multi-steps can proceed)
  const MAX_REPEAT = 2;
  const supervisorNode = async (s: typeof GraphState.State) => {
    if ((s.repeatCount ?? 0) >= MAX_REPEAT) return { next: END };
    return supervisorChain.invoke(s);
  };

  // Wire it up
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

// ========= Public API =========

// Streaming variant with ephemeral history.
// Pass an optional { sessionId } to keep separate threads.
export async function runAssistantStream(
  prompt: string,
  onChunk: (text: string) => void,
  opts?: { sessionId?: string }
): Promise<string> {
  const sessionId = opts?.sessionId || "default";

  const commands: Command[] = [
    new ListTabsCommand(),
    new OpenTabCommand(),
    new CloseTabCommand(),
    new MoveTabToNewWindowCommand(),
    new CopyTabUrlsCommand(),
    new CreateHubCommand(),
    new DeleteHubCommand(),
    new ListHubsCommand(),
    new RenameHubCommand(),
    new AddTabToHubCommand(),
    new OpenHubCommand(),
  ];

  const graph = await buildGraph(commands);

  // Seed with existing session history + this turn's user message
  const prior = getSessionMessages(sessionId);
  const seed = [...prior, new HumanMessage({ content: prompt })];

  const stream = await graph.stream({ messages: seed }, { recursionLimit: 16 });

  let lastFull = "";
  for await (const state of stream as any) {
    if ("__end__" in state) break;

    // pick the node payload (skip special key)
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

  // Persist this turn into the session history
  pushTurn(sessionId, prompt, finalText);

  return finalText;
}
