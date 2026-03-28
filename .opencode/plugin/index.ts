import type { Plugin } from "@opencode-ai/plugin";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export const CONFIG_PATH = join(homedir(), ".config", "opencode", "opencode.json");
export const DISABLED_PATH = join(homedir(), ".config", "opencode", "plugins-disabled.json");
export const ALIASES_PATH = join(homedir(), ".config", "opencode", "plugins-aliases.json");

// ── I/O helpers ───────────────────────────────────────────────────────────────

export function readConfig(): any {
  return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
}

export function writeConfig(config: any): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export function readDisabled(): string[] {
  if (!existsSync(DISABLED_PATH)) return [];
  try {
    return JSON.parse(readFileSync(DISABLED_PATH, "utf-8"));
  } catch {
    return [];
  }
}

export function writeDisabled(list: string[]): void {
  writeFileSync(DISABLED_PATH, JSON.stringify(list, null, 2) + "\n", "utf-8");
}

export function readAliases(): Record<string, string> {
  if (!existsSync(ALIASES_PATH)) return {};
  try {
    return JSON.parse(readFileSync(ALIASES_PATH, "utf-8"));
  } catch {
    return {};
  }
}

export function writeAliases(aliases: Record<string, string>): void {
  writeFileSync(ALIASES_PATH, JSON.stringify(aliases, null, 2) + "\n", "utf-8");
}

// ── Pure helpers (exported for unit tests) ────────────────────────────────────

/**
 * Resolve an alias to its target name, or return the original if not an alias.
 */
export function resolveAlias(name: string, aliases: Record<string, string>): string {
  return aliases[name] ?? name;
}

/**
 * Fuzzy-find a plugin name in a list.
 * Priority: exact → name-without-version / name@latest → substring.
 */
export function findPlugin(needle: string, haystack: string[]): string | undefined {
  return (
    haystack.find(p => p === needle) ??
    haystack.find(p => p.split("@")[0] === needle || p === needle + "@latest") ??
    haystack.find(p => p.includes(needle))
  );
}

// ── Pure command implementations (exported for unit tests) ────────────────────

export function computeList(
  enabled: string[],
  disabled: string[],
  aliases: Record<string, string>,
): string {
  const lines: string[] = ["Enabled plugins:"];
  if (enabled.length === 0) lines.push("  (none)");
  else for (const p of enabled) lines.push(`  ✓  ${p}`);

  lines.push("", "Disabled plugins:");
  if (disabled.length === 0) lines.push("  (none)");
  else for (const p of disabled) lines.push(`  ✗  ${p}`);

  const entries = Object.entries(aliases);
  lines.push("", "Aliases:");
  if (entries.length === 0) lines.push("  (none)");
  else for (const [alias, target] of entries) lines.push(`  ${alias}  →  ${target}`);

  lines.push("", "Changes take effect after restarting opencode.");
  return lines.join("\n");
}

export type DisableResult = {
  message: string;
  newEnabled?: string[];
  newDisabled?: string[];
};

export function computeDisable(
  name: string,
  enabled: string[],
  disabled: string[],
  aliases: Record<string, string>,
): DisableResult {
  const resolved = resolveAlias(name, aliases);
  const match = findPlugin(resolved, enabled);
  if (!match) {
    const hint = enabled.length ? `\nEnabled: ${enabled.join(", ")}` : "";
    return { message: `Plugin '${name}' not found in enabled list.${hint}` };
  }
  return {
    message: `Disabled '${match}'. Restart opencode to apply.`,
    newEnabled: enabled.filter(p => p !== match),
    newDisabled: disabled.includes(match) ? disabled : [...disabled, match],
  };
}

export type EnableResult = {
  message: string;
  newEnabled?: string[];
  newDisabled?: string[];
};

export function computeEnable(
  name: string,
  enabled: string[],
  disabled: string[],
  aliases: Record<string, string>,
): EnableResult {
  const resolved = resolveAlias(name, aliases);
  if (findPlugin(resolved, enabled)) return { message: `'${name}' is already enabled.` };
  const match = findPlugin(resolved, disabled);
  if (!match) {
    const hint = disabled.length ? `\nDisabled: ${disabled.join(", ")}` : "";
    return { message: `Plugin '${name}' not found in disabled list.${hint}` };
  }
  return {
    message: `Enabled '${match}'. Restart opencode to apply.`,
    newEnabled: [...enabled, match],
    newDisabled: disabled.filter(p => p !== match),
  };
}

export type AliasResult = {
  message: string;
  newAliases?: Record<string, string>;
};

export function computeAlias(
  args: string[],
  aliases: Record<string, string>,
): AliasResult {
  if (args.length === 0) {
    return { message: "Usage: /plugin alias <shorthand> <name>  or  /plugin alias remove <shorthand>" };
  }

  if (args[0] === "remove") {
    const shorthand = args[1];
    if (!shorthand) return { message: "Error: /plugin alias remove requires a shorthand name." };
    if (!(shorthand in aliases)) return { message: `Alias '${shorthand}' not found.` };
    const { [shorthand]: _removed, ...rest } = aliases;
    return { message: `Removed alias '${shorthand}'.`, newAliases: rest };
  }

  const [shorthand, ...nameParts] = args;
  const target = nameParts.join(" ");
  if (!target) {
    return { message: "Usage: /plugin alias <shorthand> <plugin-name>  or  /plugin alias remove <shorthand>" };
  }
  return {
    message: `Alias '${shorthand}' → '${target}' saved.`,
    newAliases: { ...aliases, [shorthand]: target },
  };
}

export function help(): string {
  return [
    "Usage:",
    "  /plugin list                        — show all enabled / disabled plugins + aliases",
    "  /plugin enable <name>               — enable a disabled plugin",
    "  /plugin disable <name>              — disable an enabled plugin",
    "  /plugin alias <shorthand> <name>    — create (or update) an alias",
    "  /plugin alias remove <shorthand>    — remove an alias",
    "  /plugin help                        — show this message",
    "",
    "Names are fuzzy: 'vibeguard' matches 'opencode-vibeguard'.",
    "Aliases can be used anywhere a plugin name is accepted.",
  ].join("\n");
}

// ── I/O actions ───────────────────────────────────────────────────────────────

function actionList(): string {
  const config = readConfig();
  return computeList(config.plugin ?? [], readDisabled(), readAliases());
}

function actionDisable(name: string): string {
  const config = readConfig();
  const result = computeDisable(name, config.plugin ?? [], readDisabled(), readAliases());
  if (result.newEnabled !== undefined) {
    config.plugin = result.newEnabled;
    writeConfig(config);
    writeDisabled(result.newDisabled!);
  }
  return result.message;
}

function actionEnable(name: string): string {
  const config = readConfig();
  const result = computeEnable(name, config.plugin ?? [], readDisabled(), readAliases());
  if (result.newEnabled !== undefined) {
    config.plugin = result.newEnabled;
    writeConfig(config);
    writeDisabled(result.newDisabled!);
  }
  return result.message;
}

function actionAlias(args: string[]): string {
  const result = computeAlias(args, readAliases());
  if (result.newAliases !== undefined) {
    writeAliases(result.newAliases);
  }
  return result.message;
}

// ── Plugin ────────────────────────────────────────────────────────────────────

const OpmPlugin: Plugin = async ({ client }) => {
  return {
    config: async (input) => {
      if (!input.command) input.command = {};
      input.command["plugin"] = {
        description: "Manage plugins — list | enable | disable | alias | help",
        template: "plugin $ARGUMENTS",
      };
    },

    "command.execute.before": async (input) => {
      if (input.command !== "plugin") return;

      const args = (input.arguments ?? "").trim().split(/\s+/).filter(Boolean);
      const action = args[0]?.toLowerCase();

      let result: string;
      switch (action) {
        case "list":
        case undefined:
          result = actionList();
          break;
        case "disable":
          result = args[1]
            ? actionDisable(args.slice(1).join(" "))
            : "Error: /plugin disable requires a plugin name.";
          break;
        case "enable":
          result = args[1]
            ? actionEnable(args.slice(1).join(" "))
            : "Error: /plugin enable requires a plugin name.";
          break;
        case "alias":
          result = actionAlias(args.slice(1));
          break;
        case "help":
          result = help();
          break;
        default:
          result = help();
      }

      await client.session.prompt({
        path: { id: input.sessionID },
        body: {
          noReply: true,
          parts: [{ type: "text", text: result }],
        },
      });

      // Stop the hook chain — prevents oh-my-opencode or LLM from also handling this
      throw new Error("Command handled by opm");
    },
  };
};

export default OpmPlugin;
