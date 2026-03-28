import { describe, it, expect } from "bun:test";
import {
  findPlugin,
  findPluginAll,
  resolveAlias,
  computeList,
  computeDisable,
  computeEnable,
  computeAlias,
  help,
} from "../.opencode/plugin/index";

// ── findPluginAll ─────────────────────────────────────────────────────────────

describe("findPluginAll", () => {
  it("returns all exact matches (normally just one)", () => {
    const list = ["opencode-mem", "opencode-memory", "oh-my-opencode"];
    expect(findPluginAll("opencode-mem", list)).toEqual(["opencode-mem"]);
  });

  it("returns all versioned matches", () => {
    const list = ["opencode-mem@1.0.0", "opencode-mem@2.0.0"];
    expect(findPluginAll("opencode-mem", list)).toEqual(["opencode-mem@1.0.0", "opencode-mem@2.0.0"]);
  });

  it("returns all substring matches when no exact/versioned match exists", () => {
    const list = ["opencode-mem", "opencode-memory"];
    expect(findPluginAll("mem", list)).toEqual(["opencode-mem", "opencode-memory"]);
  });

  it("exact tier wins over substring tier", () => {
    const list = ["mem", "opencode-mem"];
    expect(findPluginAll("mem", list)).toEqual(["mem"]);
  });

  it("returns empty array for no match", () => {
    expect(findPluginAll("nonexistent", ["opencode-mem"])).toEqual([]);
  });
});

// ── findPlugin ────────────────────────────────────────────────────────────────

describe("findPlugin", () => {
  const list = [
    "opencode-vibeguard",
    "oh-my-opencode",
    "@different-ai/opencode-browser",
    "opencode-mem@latest",
  ];

  it("returns exact match", () => {
    expect(findPlugin("oh-my-opencode", list)).toBe("oh-my-opencode");
  });

  it("matches name@latest via bare name", () => {
    expect(findPlugin("opencode-mem", list)).toBe("opencode-mem@latest");
  });

  it("matches scoped package via substring", () => {
    expect(findPlugin("browser", list)).toBe("@different-ai/opencode-browser");
  });

  it("exact match wins over substring", () => {
    const haystack = ["opencode-vibeguard-extra", "opencode-vibeguard"];
    expect(findPlugin("opencode-vibeguard", haystack)).toBe("opencode-vibeguard");
  });

  it("returns undefined for no match", () => {
    expect(findPlugin("nonexistent", list)).toBeUndefined();
  });

  it("returns undefined for empty list", () => {
    expect(findPlugin("anything", [])).toBeUndefined();
  });

  it("returns ambiguous object when multiple plugins match", () => {
    const haystack = ["opencode-mem", "opencode-memory"];
    const result = findPlugin("mem", haystack);
    expect(result).toMatchObject({ ambiguous: ["opencode-mem", "opencode-memory"] });
  });
});

// ── resolveAlias ──────────────────────────────────────────────────────────────

describe("resolveAlias", () => {
  const aliases = { omo: "oh-my-opencode", vg: "opencode-vibeguard" };

  it("resolves a known alias", () => {
    expect(resolveAlias("omo", aliases)).toBe("oh-my-opencode");
  });

  it("returns the name unchanged when not an alias", () => {
    expect(resolveAlias("oh-my-opencode", aliases)).toBe("oh-my-opencode");
  });

  it("returns the name unchanged on empty aliases", () => {
    expect(resolveAlias("omo", {})).toBe("omo");
  });
});

// ── computeList ───────────────────────────────────────────────────────────────

describe("computeList", () => {
  it("shows enabled and disabled plugins and aliases", () => {
    const result = computeList(
      ["opencode-mem", "opencode-pty"],
      ["oh-my-opencode"],
      { omo: "oh-my-opencode" },
    );
    expect(result).toContain("✓  opencode-mem");
    expect(result).toContain("✓  opencode-pty");
    expect(result).toContain("✗  oh-my-opencode");
    expect(result).toContain("omo  →  oh-my-opencode");
  });

  it("shows (none) for empty enabled list", () => {
    const result = computeList([], ["a"], {});
    expect(result).toContain("Enabled plugins:\n  (none)");
  });

  it("shows (none) for empty disabled list", () => {
    const result = computeList(["a"], [], {});
    expect(result).toContain("Disabled plugins:\n  (none)");
  });

  it("shows (none) for empty aliases", () => {
    const result = computeList([], [], {});
    expect(result).toContain("Aliases:\n  (none)");
  });

  // Edge case: dangling alias (target not in enabled or disabled)
  it("warns about aliases whose target no longer exists", () => {
    const result = computeList([], [], { vg: "opencode-vibeguard" });
    expect(result).toContain("⚠ target not found");
  });

  it("does not warn when alias target is in enabled list", () => {
    const result = computeList(["opencode-vibeguard"], [], { vg: "opencode-vibeguard" });
    expect(result).not.toContain("⚠");
  });

  it("does not warn when alias target is in disabled list", () => {
    const result = computeList([], ["opencode-vibeguard"], { vg: "opencode-vibeguard" });
    expect(result).not.toContain("⚠");
  });
});

// ── computeDisable ────────────────────────────────────────────────────────────

describe("computeDisable", () => {
  const enabled = ["opencode-vibeguard", "oh-my-opencode", "opencode-mem"];
  const disabled: string[] = [];

  it("disables an exact match", () => {
    const r = computeDisable("opencode-vibeguard", enabled, disabled, {});
    expect(r.newEnabled).toEqual(["oh-my-opencode", "opencode-mem"]);
    expect(r.newDisabled).toEqual(["opencode-vibeguard"]);
    expect(r.message).toContain("Disabled");
  });

  it("disables via alias", () => {
    const r = computeDisable("vg", enabled, disabled, { vg: "opencode-vibeguard" });
    expect(r.newEnabled).toEqual(["oh-my-opencode", "opencode-mem"]);
  });

  it("disables via fuzzy match", () => {
    const r = computeDisable("vibeguard", enabled, disabled, {});
    expect(r.newEnabled).toEqual(["oh-my-opencode", "opencode-mem"]);
  });

  it("returns error message when not found", () => {
    const r = computeDisable("nonexistent", enabled, disabled, {});
    expect(r.message).toContain("not found");
    expect(r.newEnabled).toBeUndefined();
    expect(r.newDisabled).toBeUndefined();
  });

  it("does not duplicate already-disabled plugin", () => {
    const r = computeDisable("opencode-vibeguard", enabled, ["opencode-vibeguard"], {});
    expect(r.newDisabled).toEqual(["opencode-vibeguard"]);
  });

  // Edge case: alias shadowing a real plugin name
  it("targets the real plugin when its name matches an alias shorthand", () => {
    // alias "foo" → "bar", but "foo" is also a real enabled plugin
    const r = computeDisable("foo", ["foo", "bar"], [], { foo: "bar" });
    // "foo" (the real plugin) should be found directly — alias is not used
    expect(r.newEnabled).toEqual(["bar"]);
    expect(r.newDisabled).toEqual(["foo"]);
  });

  // Edge case: ambiguous fuzzy match
  it("returns ambiguity error when multiple plugins match", () => {
    const r = computeDisable("mem", ["opencode-mem", "opencode-memory"], [], {});
    expect(r.message).toContain("Ambiguous");
    expect(r.message).toContain("opencode-mem");
    expect(r.message).toContain("opencode-memory");
    expect(r.newEnabled).toBeUndefined();
  });

  // Edge case: dangling alias — error message mentions what the alias resolved to
  it("includes alias resolution in error message for not-found", () => {
    const r = computeDisable("vg", [], [], { vg: "opencode-vibeguard" });
    expect(r.message).toContain("vg");
    expect(r.message).toContain("opencode-vibeguard");
  });
});

// ── computeEnable ─────────────────────────────────────────────────────────────

describe("computeEnable", () => {
  const enabled = ["opencode-mem"];
  const disabled = ["oh-my-opencode", "opencode-vibeguard"];

  it("enables an exact match", () => {
    const r = computeEnable("oh-my-opencode", enabled, disabled, {});
    expect(r.newEnabled).toEqual(["opencode-mem", "oh-my-opencode"]);
    expect(r.newDisabled).toEqual(["opencode-vibeguard"]);
    expect(r.message).toContain("Enabled");
  });

  it("enables via alias", () => {
    const r = computeEnable("omo", enabled, disabled, { omo: "oh-my-opencode" });
    expect(r.newEnabled).toEqual(["opencode-mem", "oh-my-opencode"]);
  });

  it("enables via fuzzy match", () => {
    const r = computeEnable("vibeguard", enabled, disabled, {});
    expect(r.newEnabled).toEqual(["opencode-mem", "opencode-vibeguard"]);
  });

  it("returns already-enabled message without mutation", () => {
    const r = computeEnable("opencode-mem", enabled, disabled, {});
    expect(r.message).toContain("already enabled");
    expect(r.newEnabled).toBeUndefined();
  });

  it("returns error when not in disabled list", () => {
    const r = computeEnable("nonexistent", enabled, disabled, {});
    expect(r.message).toContain("not found");
    expect(r.newEnabled).toBeUndefined();
  });

  // Edge case: alias shadowing a real plugin name
  it("targets the real plugin when its name matches an alias shorthand", () => {
    // alias "foo" → "bar", but "foo" is also in disabled
    const r = computeEnable("foo", [], ["foo", "bar"], { foo: "bar" });
    // "foo" (the real plugin) should be found directly
    expect(r.newEnabled).toEqual(["foo"]);
    expect(r.newDisabled).toEqual(["bar"]);
  });

  // Edge case: ambiguous fuzzy match in disabled list
  it("returns ambiguity error when multiple disabled plugins match", () => {
    const r = computeEnable("mem", [], ["opencode-mem", "opencode-memory"], {});
    expect(r.message).toContain("Ambiguous");
    expect(r.newEnabled).toBeUndefined();
  });

  // Edge case: stale disabled entry (plugin manually re-added to enabled)
  it("cleans up stale disabled entry when plugin is already enabled", () => {
    // opencode-vibeguard is in BOTH enabled and disabled (stale state)
    const r = computeEnable(
      "opencode-vibeguard",
      ["opencode-vibeguard"],         // already in enabled
      ["opencode-vibeguard", "other"], // also stale in disabled
      {},
    );
    expect(r.message).toContain("already enabled");
    expect(r.message).toContain("stale");
    expect(r.newDisabled).toEqual(["other"]); // stale entry removed
    expect(r.newEnabled).toBeUndefined();     // enabled list unchanged
  });

  it("does not set newDisabled when already enabled and no stale entry", () => {
    const r = computeEnable("opencode-mem", enabled, disabled, {});
    expect(r.newDisabled).toBeUndefined();
  });

  // Edge case: dangling alias — error message mentions what the alias resolved to
  it("includes alias resolution in error message for not-found", () => {
    const r = computeEnable("vg", [], [], { vg: "opencode-vibeguard" });
    expect(r.message).toContain("vg");
    expect(r.message).toContain("opencode-vibeguard");
  });
});

// ── computeAlias ──────────────────────────────────────────────────────────────

describe("computeAlias", () => {
  const aliases = { omo: "oh-my-opencode" };

  it("creates a new alias", () => {
    const r = computeAlias(["vg", "opencode-vibeguard"], aliases);
    expect(r.newAliases).toEqual({ omo: "oh-my-opencode", vg: "opencode-vibeguard" });
    expect(r.message).toContain("saved");
  });

  it("updates an existing alias", () => {
    const r = computeAlias(["omo", "oh-my-opencode-v2"], aliases);
    expect(r.newAliases!["omo"]).toBe("oh-my-opencode-v2");
  });

  it("handles plugin names with spaces joined correctly", () => {
    const r = computeAlias(["br", "@different-ai/opencode-browser"], {});
    expect(r.newAliases!["br"]).toBe("@different-ai/opencode-browser");
  });

  it("removes an existing alias", () => {
    const r = computeAlias(["remove", "omo"], aliases);
    expect(r.newAliases).toEqual({});
    expect(r.message).toContain("Removed");
  });

  it("returns error when removing a missing alias", () => {
    const r = computeAlias(["remove", "nonexistent"], aliases);
    expect(r.message).toContain("not found");
    expect(r.newAliases).toBeUndefined();
  });

  it("returns error when remove has no argument", () => {
    const r = computeAlias(["remove"], aliases);
    expect(r.message).toContain("Error");
  });

  it("returns usage when called with no args", () => {
    const r = computeAlias([], aliases);
    expect(r.message).toContain("Usage:");
    expect(r.newAliases).toBeUndefined();
  });

  it("returns usage when only shorthand is provided (no target)", () => {
    const r = computeAlias(["vg"], aliases);
    expect(r.message).toContain("Usage:");
    expect(r.newAliases).toBeUndefined();
  });
});

// ── help ──────────────────────────────────────────────────────────────────────

describe("help", () => {
  it("includes all subcommands", () => {
    const h = help();
    expect(h).toContain("/opm list");
    expect(h).toContain("/opm enable");
    expect(h).toContain("/opm disable");
    expect(h).toContain("/opm alias");
    expect(h).toContain("/opm help");
  });

  it("mentions fuzzy matching", () => {
    expect(help()).toContain("fuzzy");
  });

  it("mentions aliases can be used as names", () => {
    expect(help()).toContain("Aliases can be used");
  });
});
