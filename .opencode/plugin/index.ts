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
 * Exact-find a plugin in a list, trying the literal name first then the
 * alias-resolved name. This prevents an alias from shadowing a real plugin
 * that shares its shorthand name.
 */
function findExact(
  name: string,
  haystack: string[],
  aliases: Record<string, string>,
): string | undefined {
  if (haystack.includes(name)) return name;
  const resolved = resolveAlias(name, aliases);
  if (resolved !== name && haystack.includes(resolved)) return resolved;
  return undefined;
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
  else {
    for (const [alias, target] of entries) {
      const exists = enabled.includes(target) || disabled.includes(target);
      const warning = exists ? "" : "  ⚠ target not found";
      lines.push(`  ${alias}  →  ${target}${warning}`);
    }
  }

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
  const match = findExact(name, enabled, aliases);
  if (!match) {
    const resolved = resolveAlias(name, aliases);
    const aliasNote = resolved !== name ? ` (alias → '${resolved}')` : "";
    return { message: `Plugin '${name}'${aliasNote} not found in enabled list.\nRun /opm list to see exact plugin names.` };
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
  const inEnabled = findExact(name, enabled, aliases);
  if (inEnabled) {
    // Plugin is already enabled — clean up any stale entry in the disabled list
    const stale = disabled.find(p => p === inEnabled);
    if (stale) {
      return {
        message: `'${name}' is already enabled. Cleaned up stale disabled entry '${stale}'.`,
        newDisabled: disabled.filter(p => p !== stale),
      };
    }
    return { message: `'${name}' is already enabled.` };
  }

  const match = findExact(name, disabled, aliases);
  if (!match) {
    const resolved = resolveAlias(name, aliases);
    const aliasNote = resolved !== name ? ` (alias → '${resolved}')` : "";
    return { message: `Plugin '${name}'${aliasNote} not found in disabled list.\nRun /opm list to see exact plugin names.` };
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
    "  /opm list                        — show all enabled / disabled plugins + aliases",
    "  /opm enable <name>               — enable a disabled plugin",
    "  /opm disable <name>              — disable an enabled plugin",
    "  /opm alias <shorthand> <name>    — create (or update) an alias",
    "  /opm alias remove <shorthand>    — remove an alias",
    "  /opm help                        — show this message",
    "",
    "Names must be exact. Use /opm list to see exact plugin names.",
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
      input.command["opm"] = {
        description: "Manage plugins — list | enable | disable | alias | help",
        template: "opm $ARGUMENTS",
      };
    },

    "command.execute.before": async (input) => {
      if (input.command !== "opm") return;

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
            : "Error: /opm disable requires a plugin name.";
          break;
        case "enable":
          result = args[1]
            ? actionEnable(args.slice(1).join(" "))
            : "Error: /opm enable requires a plugin name.";
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
      throw new Error("Command handled by @json9512/opm");
    },
  };
};

export default OpmPlugin;
