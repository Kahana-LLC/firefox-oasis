/** Graph execution limits. Used by graph.ts and supervisorQueue.ts. */
export const ASSISTANT_RECURSION_LIMIT = 24;
export const MAX_NESTED_COMMANDS = 3;

/** Internal arg key for chained-command truncation notice (supervisor → tool). */
export const INTERNAL_CHAIN_NOTICE_ARG = "__oasisChainNotice";
export const STREAM_GUARD_MESSAGE =
  "I stopped this request to avoid a routing loop. Please rephrase and try again.";
