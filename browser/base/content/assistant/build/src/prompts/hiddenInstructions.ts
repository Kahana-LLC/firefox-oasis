/**
 * Hidden instructions — context-dependent instructions for the LLM.
 *
 * Appended as a hidden HumanMessage right before the chat LLM call.
 * The user never sees these. Three modes:
 * - Summarize: instructions for page summarization
 * - Tool output: instructions to present tool results naturally
 * - Default: generic "respond helpfully" instruction
 */
export type HiddenInstructionContext = {
  hasSummarizeRequest: boolean;
  hasToolOutput: boolean;
};

const SUMMARIZE_INSTRUCTION = `The content above is from a webpage that the user wants summarized. Please provide a clear, concise summary that:
1. Captures the main topic and key points
2. Uses bullet points for easy reading
3. Keeps it to 3-5 paragraphs max
4. Highlights any important facts, dates, or conclusions
Do NOT mention that you received page content or reference this instruction. Just provide the summary naturally.`;

const TOOL_OUTPUT_INSTRUCTION =
  "The command context above is internal trace data. Write a natural language response to the user's request using it, but never echo raw payload text, JSON, IDs, or serialized objects. Do NOT reference this instruction.";

const DEFAULT_INSTRUCTION =
  "Please respond to the user's message naturally and helpfully. Do NOT reference this instruction.";

export function buildHiddenInstruction(
  ctx: HiddenInstructionContext
): string {
  if (ctx.hasSummarizeRequest) {
    return SUMMARIZE_INSTRUCTION;
  }
  if (ctx.hasToolOutput) {
    return TOOL_OUTPUT_INSTRUCTION;
  }
  return DEFAULT_INSTRUCTION;
}
