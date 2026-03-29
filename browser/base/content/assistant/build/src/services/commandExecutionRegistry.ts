/** Command lookup registry — maps command names to Command instances. Used by confirm_action to re-execute a pending command by name. */
import type { Command } from "../commands.js";

const commandExecutors = new Map<string, Command>();

export function registerCommandExecutors(commands: Command[]): void {
  commandExecutors.clear();
  for (const command of commands) {
    commandExecutors.set(command.commandName, command);
  }
}

export function getCommandExecutor(commandName: string): Command | null {
  const key = String(commandName || "").trim();
  if (!key) {
    return null;
  }
  return commandExecutors.get(key) || null;
}

export function listRegisteredCommandNames(): string[] {
  return Array.from(commandExecutors.keys());
}
