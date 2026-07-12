import type { Plugin } from "@opencode-ai/plugin";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import {
  computeList,
  computeDisable,
  computeEnable,
  computeAlias,
  findExact,
  help,
} from "./lib/logic.ts";

const CONFIG_PATH = join(homedir(), ".config", "opencode", "opencode.json");
const DISABLED_PATH = join(homedir(), ".config", "opencode", "plugins-disabled.json");
const ALIASES_PATH = join(homedir(), ".config", "opencode", "plugins-aliases.json");

const PROJECT_LIST_CMD = "/opm list -p";
const projectConfigPath = (root: string) => join(root, "opencode.json");
const projectDisabledPath = (root: string) => join(root, ".opencode", "opm-disabled.json");

// ── I/O helpers ───────────────────────────────────────────────────────────────

function readConfig(): any {
  return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
}

function writeConfig(config: any): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

function readDisabled(): string[] {
  if (!existsSync(DISABLED_PATH)) return [];
  try {
    return JSON.parse(readFileSync(DISABLED_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function writeDisabled(list: string[]): void {
  writeFileSync(DISABLED_PATH, JSON.stringify(list, null, 2) + "\n", "utf-8");
}

function readAliases(): Record<string, string> {
  if (!existsSync(ALIASES_PATH)) return {};
  try {
    return JSON.parse(readFileSync(ALIASES_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function writeAliases(aliases: Record<string, string>): void {
  writeFileSync(ALIASES_PATH, JSON.stringify(aliases, null, 2) + "\n", "utf-8");
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
  const config = readConfig();
  const result = computeAlias(args, readAliases(), config.plugin ?? [], readDisabled());
  if (result.newAliases !== undefined) {
    writeAliases(result.newAliases);
  }
  return result.message;
}

// ── Project-scoped I/O ──────────────────────────────────────────────────────────

function readProjectConfig(root: string): any {
  const path = projectConfigPath(root);
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf-8"));
}

function writeProjectConfig(root: string, config: any): void {
  const path = projectConfigPath(root);
  if (!existsSync(path) && !config.$schema) {
    config = { $schema: "https://opencode.ai/config.json", ...config };
  }
  writeFileSync(path, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

function readProjectDisabled(root: string): string[] {
  const path = projectDisabledPath(root);
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return [];
  }
}

function writeProjectDisabled(root: string, list: string[]): void {
  const dir = join(root, ".opencode");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(projectDisabledPath(root), JSON.stringify(list, null, 2) + "\n", "utf-8");
}

// ── Project-scoped actions ──────────────────────────────────────────────────────

function actionListProject(root: string): string {
  const config = readProjectConfig(root);
  const body = computeList(config.plugin ?? [], readProjectDisabled(root), readAliases());
  return `Project scope — ${projectConfigPath(root)}\n\n${body}`;
}

function actionDisableProject(root: string, name: string): string {
  const config = readProjectConfig(root);
  const aliases = readAliases();
  const result = computeDisable(name, config.plugin ?? [], readProjectDisabled(root), aliases, PROJECT_LIST_CMD);
  if (result.newEnabled !== undefined) {
    config.plugin = result.newEnabled;
    writeProjectConfig(root, config);
    writeProjectDisabled(root, result.newDisabled!);
    return result.message;
  }

  let globalPlugins: string[] = [];
  try {
    globalPlugins = readConfig().plugin ?? [];
  } catch {
    globalPlugins = [];
  }
  const global = findExact(name, globalPlugins, aliases);
  if (global) {
    return `${result.message}\n\n'${global}' is enabled globally. OpenCode can't disable a globally-declared plugin for a single project — add it to this project's opencode.json to manage it here.`;
  }
  return result.message;
}

function actionEnableProject(root: string, name: string): string {
  const config = readProjectConfig(root);
  const result = computeEnable(name, config.plugin ?? [], readProjectDisabled(root), readAliases(), PROJECT_LIST_CMD);
  if (result.newEnabled !== undefined) {
    config.plugin = result.newEnabled;
    writeProjectConfig(root, config);
    writeProjectDisabled(root, result.newDisabled!);
  }
  return result.message;
}

// ── Plugin ────────────────────────────────────────────────────────────────────

const OpmPlugin: Plugin = async ({ client, worktree, directory }) => {
  const root = worktree || directory;
  return {
    config: async (input) => {
      if (!input.command) input.command = {};
      input.command["opm"] = {
        description: "Manage plugins — list | enable | disable | alias | help",
        template: "Run /opm with arguments: $ARGUMENTS",
      };
    },
    "command.execute.before": async (input) => {
      if (input.command !== "opm") return;

      const raw = (input.arguments ?? "").trim().split(/\s+/).filter(Boolean);
      const project = raw.some((a) => a === "-p" || a === "--project");
      const args = raw.filter((a) => a !== "-p" && a !== "--project");
      const action = args[0]?.toLowerCase();

      let result: string;
      switch (action) {
        case "list":
        case undefined:
          result = project ? actionListProject(root) : actionList();
          break;
        case "disable":
          result = args[1]
            ? project
              ? actionDisableProject(root, args.slice(1).join(" "))
              : actionDisable(args.slice(1).join(" "))
            : "Error: /opm disable requires a plugin name.";
          break;
        case "enable":
          result = args[1]
            ? project
              ? actionEnableProject(root, args.slice(1).join(" "))
              : actionEnable(args.slice(1).join(" "))
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

      throw new Error("Command handled by @json9512/opm");
    },
  };
};

export default OpmPlugin;
