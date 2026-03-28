import { describe, it, expect } from "bun:test";
import {
  resolveAlias,
  computeList,
  computeDisable,
  computeEnable,
  computeAlias,
  help,
} from "../.opencode/plugin/lib/logic";

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
    expect(computeList([], ["a"], {})).toContain("Enabled plugins:\n  (none)");
  });

  it("shows (none) for empty disabled list", () => {
    expect(computeList(["a"], [], {})).toContain("Disabled plugins:\n  (none)");
  });

  it("shows (none) for empty aliases", () => {
    expect(computeList([], [], {})).toContain("Aliases:\n  (none)");
  });

  it("warns about a dangling alias whose target is in neither list", () => {
    const result = computeList([], [], { vg: "opencode-vibeguard" });
    expect(result).toContain("⚠ target not found");
  });

  it("does not warn when alias target is in the enabled list", () => {
    expect(computeList(["opencode-vibeguard"], [], { vg: "opencode-vibeguard" })).not.toContain("⚠");
  });

  it("does not warn when alias target is in the disabled list", () => {
    expect(computeList([], ["opencode-vibeguard"], { vg: "opencode-vibeguard" })).not.toContain("⚠");
  });
});

// ── computeDisable ────────────────────────────────────────────────────────────

describe("computeDisable", () => {
  const enabled = ["opencode-vibeguard", "oh-my-opencode", "opencode-mem"];
  const disabled: string[] = [];

  it("disables by exact name", () => {
    const r = computeDisable("opencode-vibeguard", enabled, disabled, {});
    expect(r.newEnabled).toEqual(["oh-my-opencode", "opencode-mem"]);
    expect(r.newDisabled).toEqual(["opencode-vibeguard"]);
    expect(r.message).toContain("Disabled");
  });

  it("disables via alias", () => {
    const r = computeDisable("vg", enabled, disabled, { vg: "opencode-vibeguard" });
    expect(r.newEnabled).toEqual(["oh-my-opencode", "opencode-mem"]);
    expect(r.newDisabled).toEqual(["opencode-vibeguard"]);
  });

  it("does not match by substring — requires exact name", () => {
    const r = computeDisable("vibeguard", enabled, disabled, {});
    expect(r.message).toContain("not found");
    expect(r.newEnabled).toBeUndefined();
  });

  it("returns error with hint when not found", () => {
    const r = computeDisable("nonexistent", enabled, disabled, {});
    expect(r.message).toContain("not found");
    expect(r.message).toContain("/opm list");
    expect(r.newEnabled).toBeUndefined();
  });

  it("does not duplicate an already-disabled plugin", () => {
    const r = computeDisable("opencode-vibeguard", enabled, ["opencode-vibeguard"], {});
    expect(r.newDisabled).toEqual(["opencode-vibeguard"]);
  });

  it("includes alias resolution in error message for a dangling alias", () => {
    const r = computeDisable("vg", [], [], { vg: "opencode-vibeguard" });
    expect(r.message).toContain("vg");
    expect(r.message).toContain("opencode-vibeguard");
  });

  it("targets the real plugin when its exact name matches the alias shorthand", () => {
    const r = computeDisable("foo", ["foo", "bar"], [], { foo: "bar" });
    expect(r.newEnabled).toEqual(["bar"]);
    expect(r.newDisabled).toEqual(["foo"]);
  });
});

// ── computeEnable ─────────────────────────────────────────────────────────────

describe("computeEnable", () => {
  const enabled = ["opencode-mem"];
  const disabled = ["oh-my-opencode", "opencode-vibeguard"];

  it("enables by exact name", () => {
    const r = computeEnable("oh-my-opencode", enabled, disabled, {});
    expect(r.newEnabled).toEqual(["opencode-mem", "oh-my-opencode"]);
    expect(r.newDisabled).toEqual(["opencode-vibeguard"]);
    expect(r.message).toContain("Enabled");
  });

  it("enables via alias", () => {
    const r = computeEnable("omo", enabled, disabled, { omo: "oh-my-opencode" });
    expect(r.newEnabled).toEqual(["opencode-mem", "oh-my-opencode"]);
  });

  it("does not match by substring — requires exact name", () => {
    const r = computeEnable("vibeguard", enabled, disabled, {});
    expect(r.message).toContain("not found");
    expect(r.newEnabled).toBeUndefined();
  });

  it("returns already-enabled message without mutation", () => {
    const r = computeEnable("opencode-mem", enabled, disabled, {});
    expect(r.message).toContain("already enabled");
    expect(r.newEnabled).toBeUndefined();
  });

  it("returns error with hint when not found in disabled list", () => {
    const r = computeEnable("nonexistent", enabled, disabled, {});
    expect(r.message).toContain("not found");
    expect(r.message).toContain("/opm list");
    expect(r.newEnabled).toBeUndefined();
  });

  it("includes alias resolution in error message for a dangling alias", () => {
    const r = computeEnable("vg", [], [], { vg: "opencode-vibeguard" });
    expect(r.message).toContain("vg");
    expect(r.message).toContain("opencode-vibeguard");
  });

  it("targets the real plugin when its exact name matches the alias shorthand", () => {
    const r = computeEnable("foo", [], ["foo", "bar"], { foo: "bar" });
    expect(r.newEnabled).toEqual(["foo"]);
    expect(r.newDisabled).toEqual(["bar"]);
  });

  it("cleans up stale disabled entry when the plugin is already enabled", () => {
    const r = computeEnable(
      "opencode-vibeguard",
      ["opencode-vibeguard"],
      ["opencode-vibeguard", "other"],
      {},
    );
    expect(r.message).toContain("already enabled");
    expect(r.message).toContain("stale");
    expect(r.newDisabled).toEqual(["other"]);
    expect(r.newEnabled).toBeUndefined();
  });

  it("does not set newDisabled when already enabled with no stale entry", () => {
    const r = computeEnable("opencode-mem", enabled, disabled, {});
    expect(r.newDisabled).toBeUndefined();
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

  it("handles scoped package names correctly", () => {
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

  it("mentions aliases can be used as names", () => {
    expect(help()).toContain("Aliases can be used");
  });
});
