# opm

A plugin for [OpenCode](https://opencode.ai) that lets you manage other plugins at runtime — enable, disable, alias, and inspect them — without ever leaving the chat.

## Why?

OpenCode plugins are declared in `opencode.json`. Toggling one normally means:

1. Opening the config file in an editor
2. Commenting out or deleting the plugin entry
3. Restarting OpenCode

This plugin replaces all of that with a single slash command. It also persists disabled plugins so they can be re-enabled without remembering their exact package names.

## Features

- **List plugins**: See all enabled and disabled plugins at a glance
- **Disable**: Remove a plugin from the active config without losing its name
- **Enable**: Restore a disabled plugin back into the config
- **Project scope**: Manage a plugin per project with `-p` — it operates on the project's own `opencode.json`, which OpenCode applies automatically when you work in that project
- **Aliases**: Create short nicknames for long plugin names (e.g. `omo` → `oh-my-opencode`)
- **Exact matching**: plugin names must match exactly as they appear in your config — use `/opm list` to check
- **No LLM involvement**: Commands are intercepted before the model is called; results appear instantly

## Setup

Add the plugin to your [OpenCode config](https://opencode.ai/docs/config/):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@json9512/opm"]
}
```

> **Important:** `@json9512/opm` must be the **first** entry in the `plugin` array. This ensures it intercepts `/opm` commands before other plugins (e.g. `oh-my-opencode`) can handle them.

OpenCode will automatically install the plugin on next run. Because plugins are loaded at startup, **you need to restart OpenCode twice after a clean install** — once for the install to complete, and again for the `/opm` command to become available.

## Slash Commands

| Command | Description |
|---------|-------------|
| `/opm` or `/opm list` | Show all enabled and disabled plugins, plus any saved aliases |
| `/opm enable <name>` | Move a plugin from the disabled list back into the config |
| `/opm disable <name>` | Remove a plugin from the config and save it to the disabled list |
| `/opm alias <shorthand> <name>` | Create (or update) a shorthand alias for a plugin name |
| `/opm alias remove <shorthand>` | Remove a saved alias |
| `/opm help` | Show usage information |

Add `-p` (or `--project`) to `list`, `enable`, or `disable` to operate on the **current project** instead of the global config:

| Command | Description |
|---------|-------------|
| `/opm list -p` | Show the current project's enabled / disabled plugins |
| `/opm enable <name> -p` | Restore a project-disabled plugin into the project's `opencode.json` |
| `/opm disable <name> -p` | Remove a plugin from the project's `opencode.json` and record it in the project disabled list |

### Plugin names

Plugin names must match exactly as they appear in your `opencode.json`. Run `/opm list` to see the exact names. Use aliases to avoid typing long names repeatedly.

### Aliases

Aliases are persistent shortcuts stored in `~/.config/opencode/plugins-aliases.json`.

The alias target must be a plugin already known to opm (i.e. currently enabled or disabled). If the target is not found in either list, the command returns an error.

```
/opm alias omo oh-my-opencode
/opm alias vg opencode-vibeguard

/opm disable omo              → disables oh-my-opencode
/opm enable vg                → enables opencode-vibeguard
/opm disable oh-my-opencode   → also works with exact names
```

## How it works

### State files

| File | Purpose |
|------|---------|
| `~/.config/opencode/opencode.json` | Source of truth for enabled plugins (`plugin` array) |
| `~/.config/opencode/plugins-disabled.json` | Disabled plugin names (created on first disable) |
| `~/.config/opencode/plugins-aliases.json` | Alias map `{ "shorthand": "full-name" }` (created on first alias) |

### Disable / enable cycle

```
/opm disable vibeguard
  → removes "opencode-vibeguard" from opencode.json plugin array
  → appends "opencode-vibeguard" to plugins-disabled.json

/opm enable vibeguard
  → removes "opencode-vibeguard" from plugins-disabled.json
  → appends "opencode-vibeguard" back to opencode.json plugin array
```

Changes take effect after restarting OpenCode.

### Project-level plugins

OpenCode merges a project's own `opencode.json` (the nearest one from your working directory up to the worktree root) on top of the global config. `-p` points opm at that project file instead of the global one:

```
/opm disable vibeguard -p
  → removes "opencode-vibeguard" from <project>/opencode.json plugin array
  → appends "opencode-vibeguard" to <project>/.opencode/opm-disabled.json

/opm enable vibeguard -p
  → removes "opencode-vibeguard" from <project>/.opencode/opm-disabled.json
  → appends "opencode-vibeguard" back to <project>/opencode.json plugin array
```

Because the disabled plugin is simply absent from the project's config, OpenCode applies the change automatically the next time you start it in that project — no global edits, and the disabled list lives inside the project so it can be committed and shared with the team.

| File | Purpose |
|------|---------|
| `<project>/opencode.json` | Plugins enabled at project scope (`plugin` array) |
| `<project>/.opencode/opm-disabled.json` | Plugins disabled for this project (created on first project disable) |

> **Limitation:** OpenCode merges plugin arrays *additively* — a project config can only add plugins, never subtract one that is declared globally. So `-p` manages plugins that are enabled at project scope; it cannot turn off a globally-declared plugin for a single project. To manage a plugin per project, declare it in that project's `opencode.json` rather than the global config. If you try to `disable -p` a global plugin, opm tells you so.

### Hook implementation

The plugin registers the `/opm` command via the `config` hook and intercepts it via `command.execute.before`. It calls `client.session.prompt({ noReply: true })` to display the result directly in chat, then throws to stop the hook chain — preventing downstream plugins from re-processing the command.

```typescript
const OpmPlugin: Plugin = async ({ client, worktree, directory }) => ({
  config: async (input) => {
    if (!input.command) input.command = {};
    input.command["opm"] = {
      description: "Manage plugins — list | enable | disable | alias | help",
      template: "Run /opm with arguments: $ARGUMENTS",
    };
  },
  "command.execute.before": async (input) => {
    if (input.command !== "opm") return;
    // ... handle command ...
    await client.session.prompt({
      path: { id: input.sessionID },
      body: { noReply: true, parts: [{ type: "text", text: result }] },
    });
    throw new Error("Command handled by @json9512/opm");
  },
});
```

## Local development

Requires [Bun](https://bun.sh) ≥ 1.0.

```bash
git clone https://github.com/json9512/opm.git
cd opm
bun install
bun test
```

### Running tests

```bash
bun test
```

All command logic is implemented as pure functions (no file I/O) and covered by unit tests.

```
 39 pass
  0 fail
```
