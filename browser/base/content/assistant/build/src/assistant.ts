import { Annotation, END, START, StateGraph } from "@langchain/langgraph/web";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatAnthropic } from "@langchain/anthropic";
import { SystemMessage, HumanMessage, BaseMessage } from "@langchain/core/messages";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { DynamicTool } from "@langchain/core/tools";
import { z } from "zod";
import { ListTabsCommand, OpenTabCommand, Command, CmdResult, CloseTabCommand, MoveTabToNewWindowCommand, CopyTabUrlsCommand } from "./commands";

// Baked by esbuild.define()
const anthropicApiKey = process.env.ANTHROPIC_API_KEY as string;

if (!anthropicApiKey) throw new Error("ANTHROPIC_API_KEY was not baked into the bundle.");

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

async function buildGraph(commands: Command[]) {
  const llm = new ChatAnthropic({
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    modelName: "claude-3-5-sonnet-20240620",
    temperature: 0.3,
    maxTokens: 150,
    // @ts-ignore
    timeout: 30000,
    // @ts-ignore
    maxRetries: 2,
  });
  const toolAgents: Record<string, any> = {};
  const memberNames: string[] = [];

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

      const nextRepeat =
        state.lastWorker === command.commandName ? (state.repeatCount ?? 0) + 1 : 1;

      return {
        messages: [new HumanMessage({ content: last.content, name: command.commandName })],
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

  After a worker reports success (Often a message stating the action it did),
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
    // multi-step example: open then move
    { user: "open github and put it in a new window", next: "open_tab" },
    // ambiguity → safe default
    { user: "can you help with my tabs?", next: "list_tabs" },
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
    ["system", `You are a supervisor managing these workers: {members}. Choose the next worker. Use FINISH if done.`],
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

  // Wrap the LLM router with loop guard + success FINISH
  const MAX_REPEAT = 2;
  const SUCCESS_PREFIXES = ["Opened", "Closed", "Moved", "Copied", "Listed", "OK", "Done"];

  const supervisorNode = async (s: typeof GraphState.State) => {
    // Hard stop on repeats
    if ((s.repeatCount ?? 0) >= MAX_REPEAT) return { next: END };

    // If the last message looks like a successful tool result, FINISH
    const last = s.messages?.[s.messages.length - 1] as any;
    const txt =
      typeof last?.content === "string"
        ? last.content.trim()
        : Array.isArray(last?.content)
        ? last.content.map((c: any) => (typeof c === "string" ? c : c?.text || "")).join("")
        : "";

    if (txt && SUCCESS_PREFIXES.some((p) => txt.startsWith(p))) {
      return { next: END };
    }

    // Otherwise, ask the supervisor LLM to pick the next worker
    return supervisorChain.invoke(s);
  };

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

// ---------- Public APIs ----------

// Non-streaming (kept for compatibility)
// export async function runAssistant(prompt: string): Promise<string> {
//   const commands: Command[] = [
//     new ListTabsCommand(),
//     new OpenTabCommand(),
//     new CloseTabCommand(),
//     new MoveTabToNewWindowCommand(),
//     new CopyTabUrlsCommand(),
//   ];
//   const graph = await buildGraph(commands);
//   const stream = await graph.stream(
//     { messages: [new HumanMessage({ content: prompt })] },
//     { recursionLimit: 16 }
//   );

//   const outputs: string[] = [];
//   for await (const state of stream as any) {
//     if ("__end__" in state) break;
//     const step = Object.entries(state).find(([k]) => k !== "__end");
//     if (step?.[1] && "messages" in (step[1] as any)) {
//       const lastMsg = (step[1] as any).messages.at(-1);
//       if (lastMsg?.content) outputs.push(
//         typeof lastMsg.content === "string"
//           ? lastMsg.content
//           : Array.isArray(lastMsg.content)
//           ? lastMsg.content.map((c: any) => (typeof c === "string" ? c : c?.text || "")).join("")
//           : String(lastMsg.content)
//       );
//     }
//   }
//   return outputs.join("\n\n") || "(no output)";
// }

// Streaming variant used by the UI for live updates
export async function runAssistantStream(
  prompt: string,
  onChunk: (text: string) => void
): Promise<string> {
  const commands: Command[] = [
    new ListTabsCommand(),
    new OpenTabCommand(),
    new CloseTabCommand(),
    new MoveTabToNewWindowCommand(),
    new CopyTabUrlsCommand(),
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
