// Pure command logic — no I/O, exported for unit tests.

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
export function findExact(
  name: string,
  haystack: string[],
  aliases: Record<string, string>,
): string | undefined {
  if (haystack.includes(name)) return name;
  const resolved = resolveAlias(name, aliases);
  if (resolved !== name && haystack.includes(resolved)) return resolved;
  return undefined;
}

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
