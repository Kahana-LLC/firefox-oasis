# Command Execution Issue Report
**Date:** January 17, 2026  
**Issue:** AI assistant showing tool code instead of executing commands

## Problem Description

When users request actions like "search nba" or "search nba on google", the AI assistant is:
1. **Displaying tool code as text** instead of executing commands
2. **Showing code blocks** like `print(web_search.search(queries=["nba"]))` in chat bubbles
3. **Not actually performing the requested actions** (e.g., not opening Google search tabs)

## Root Cause Analysis

### Issue 1: Supervisor Routing to Chat Instead of Tools

**Problem:** The supervisor is routing search queries to the "chat" node instead of the "open_tab" command.

**Evidence:**
- User says "search nba"
- Supervisor routes to "chat" 
- Chat node generates tool code as text instead of executing

**Why it happens:**
- The supervisor prompt doesn't have clear examples for handling "search" queries
- The supervisor defaults to "chat" when unsure
- Search queries are being treated as conversational rather than actionable

### Issue 2: Chat Node Generating Tool Code

**Problem:** The chat node is generating tool code blocks instead of only providing natural language responses.

**Evidence:**
- Chat node outputs: `\`\`\`tool_code\nprint(web_search.search(queries=["nba"]))\n\`\`\``
- This is displayed to the user instead of executing the command

**Why it happens:**
- The chat node prompt doesn't explicitly forbid generating tool code
- The LLM is hallucinating tool syntax instead of understanding it should only summarize/answer
- The chat node is being called when it shouldn't be (should route to tools first)

## Code Analysis

### Current Flow

1. **User Input:** "search nba"
2. **Supervisor Decision:** Routes to "chat" (incorrect)
3. **Chat Node:** Generates tool code as text (incorrect behavior)
4. **Result:** User sees code, no action taken

### Expected Flow

1. **User Input:** "search nba"
2. **Supervisor Decision:** Routes to "open_tab" with `url: "https://www.google.com/search?q=nba"`
3. **OpenTabCommand:** Executes and opens Google search
4. **Chat Node:** Provides friendly confirmation like "I've opened a Google search for 'nba'"
5. **Result:** Tab opens, user sees confirmation

## Fixes Applied

### Fix 1: Updated Supervisor Prompt

**Added explicit search query handling:**
- Added examples: "search nba" → route to `open_tab` with Google search URL
- Added rule: "When user says 'search X', ALWAYS route to 'open_tab' with Google search URL"
- Added critical note: "DO NOT route to 'chat' for search queries"

### Fix 2: Updated Chat Node Prompt

**Added explicit restrictions:**
- **DO NOT generate tool code or command syntax**
- **DO NOT show tool_code blocks**
- **ONLY provide natural language responses**
- Chat node is called AFTER commands execute to provide explanations

### Fix 3: Enhanced OpenTabCommand

**Added support for full URLs:**
- Now handles URLs that start with `http://` or `https://` directly
- This allows supervisor to pass Google search URLs directly

## Expected Behavior After Fix

When user says "search nba on google":

1. **Supervisor routes to:** `open_tab` with `url: "https://www.google.com/search?q=nba"`
2. **OpenTabCommand executes:** Opens Google search tab
3. **Tool output:** `[Tool Output for open_tab]: Opened https://www.google.com/search?q=nba`
4. **Supervisor routes to:** `chat` (after tool execution)
5. **Chat node responds:** "I've opened a Google search for 'nba'."
6. **User sees:** Tab opens + friendly confirmation message

## Testing Checklist

- [ ] "search nba" → Opens Google search tab
- [ ] "search nba on google" → Opens Google search tab  
- [ ] "search python tutorials" → Opens Google search tab
- [ ] No tool_code blocks appear in chat
- [ ] Chat responses are natural language only
- [ ] Commands actually execute (tabs open, etc.)

## Code References

- **Supervisor Prompt:** `browser/base/content/assistant/build/src/assistant.ts` lines 133-198
- **Chat Node Prompt:** `browser/base/content/assistant/build/src/assistant.ts` lines 200-231
- **OpenTabCommand:** `browser/base/content/assistant/build/src/commands.ts` lines 122-159
- **Supervisor Logic:** `browser/base/content/assistant/build/src/assistant.ts` lines 233-264

## Conclusion

The issue was caused by:
1. **Insufficient supervisor guidance** for handling search queries
2. **Chat node generating code** instead of only providing natural language

Both issues have been fixed by:
1. Adding explicit search query examples to supervisor prompt
2. Adding explicit restrictions to chat node prompt
3. Enhancing OpenTabCommand to handle full URLs

After rebuilding and testing, search queries should now execute properly and open Google search tabs instead of showing tool code.
