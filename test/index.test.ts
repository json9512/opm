import { describe, it, expect } from "bun:test";
import {
  findPlugin,
  resolveAlias,
  computeList,
  computeDisable,
  computeEnable,
  computeAlias,
  help,
} from "../.opencode/plugin/index";

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
    expect(h).toContain("/plugin list");
    expect(h).toContain("/plugin enable");
    expect(h).toContain("/plugin disable");
    expect(h).toContain("/plugin alias");
    expect(h).toContain("/plugin help");
  });

  it("mentions fuzzy matching", () => {
    expect(help()).toContain("fuzzy");
  });

  it("mentions aliases can be used as names", () => {
    expect(help()).toContain("Aliases can be used");
  });
});
