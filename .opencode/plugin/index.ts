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
 * Fuzzy-find all plugins matching needle in a list.
 * Priority tiers: exact → name-without-version / name@latest → substring.
 * Returns all matches at the highest tier that has any match.
 */
export function findPluginAll(needle: string, haystack: string[]): string[] {
  const exact = haystack.filter(p => p === needle);
  if (exact.length) return exact;
  const versioned = haystack.filter(p => p.split("@")[0] === needle || p === needle + "@latest");
  if (versioned.length) return versioned;
  return haystack.filter(p => p.includes(needle));
}

/**
 * Fuzzy-find a single plugin. Returns undefined if none match, or throws an
 * ambiguity error string if multiple plugins match the same needle.
 */
export function findPlugin(needle: string, haystack: string[]): string | { ambiguous: string[] } | undefined {
  const matches = findPluginAll(needle, haystack);
  if (matches.length === 0) return undefined;
  if (matches.length > 1) return { ambiguous: matches };
  return matches[0];
}

/**
 * Try literal name first, then fall back to alias resolution.
 * This prevents an alias from shadowing a real plugin that shares its name.
 */
function findWithAlias(
  name: string,
  haystack: string[],
  aliases: Record<string, string>,
): string | { ambiguous: string[] } | undefined {
  const direct = findPlugin(name, haystack);
  if (direct !== undefined) return direct;
  const resolved = resolveAlias(name, aliases);
  if (resolved === name) return undefined;
  return findPlugin(resolved, haystack);
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
      const exists =
        findPlugin(target, enabled) !== undefined ||
        findPlugin(target, disabled) !== undefined;
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
  const result = findWithAlias(name, enabled, aliases);
  if (result === undefined) {
    const resolved = resolveAlias(name, aliases);
    const aliasNote = resolved !== name ? ` (alias → '${resolved}')` : "";
    const hint = enabled.length ? `\nEnabled: ${enabled.join(", ")}` : "";
    return { message: `Plugin '${name}'${aliasNote} not found in enabled list.${hint}` };
  }
  if (typeof result === "object") {
    return {
      message: `Ambiguous: '${name}' matches multiple plugins:\n${result.ambiguous.map(m => `  ${m}`).join("\n")}\nPlease use a more specific name.`,
    };
  }
  return {
    message: `Disabled '${result}'. Restart opencode to apply.`,
    newEnabled: enabled.filter(p => p !== result),
    newDisabled: disabled.includes(result) ? disabled : [...disabled, result],
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
  const inEnabled = findWithAlias(name, enabled, aliases);
  if (inEnabled !== undefined && typeof inEnabled === "string") {
    // Plugin is already enabled — clean up any stale entry in the disabled list
    const stale = findPlugin(inEnabled, disabled);
    if (stale && typeof stale === "string") {
      return {
        message: `'${name}' is already enabled. Cleaned up stale disabled entry '${stale}'.`,
        newDisabled: disabled.filter(p => p !== stale),
      };
    }
    return { message: `'${name}' is already enabled.` };
  }

  const result = findWithAlias(name, disabled, aliases);
  if (result === undefined) {
    const resolved = resolveAlias(name, aliases);
    const aliasNote = resolved !== name ? ` (alias → '${resolved}')` : "";
    const hint = disabled.length ? `\nDisabled: ${disabled.join(", ")}` : "";
    return { message: `Plugin '${name}'${aliasNote} not found in disabled list.${hint}` };
  }
  if (typeof result === "object") {
    return {
      message: `Ambiguous: '${name}' matches multiple plugins:\n${result.ambiguous.map(m => `  ${m}`).join("\n")}\nPlease use a more specific name.`,
    };
  }
  return {
    message: `Enabled '${result}'. Restart opencode to apply.`,
    newEnabled: [...enabled, result],
    newDisabled: disabled.filter(p => p !== result),
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
