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
- **Aliases**: Create short nicknames for long plugin names (e.g. `omo` → `oh-my-opencode`)
- **Fuzzy matching**: `vibeguard` matches `opencode-vibeguard` — no need for exact names
- **No LLM involvement**: Commands are intercepted before the model is called; results appear instantly

## Setup

Add the plugin to your [OpenCode config](https://opencode.ai/docs/config/):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@json9512/opm"]
}
```

> **Important:** `@json9512/opm` must be the **first** entry in the `plugin` array. This ensures it intercepts `/plugin` commands before other plugins (e.g. `oh-my-opencode`) can handle them.

OpenCode will automatically install the plugin on next run.

## Slash Commands

| Command | Description |
|---------|-------------|
| `/plugin list` | Show all enabled and disabled plugins, plus any saved aliases |
| `/plugin enable <name>` | Move a plugin from the disabled list back into the config |
| `/plugin disable <name>` | Remove a plugin from the config and save it to the disabled list |
| `/plugin alias <shorthand> <name>` | Create (or update) a shorthand alias for a plugin name |
| `/plugin alias remove <shorthand>` | Remove a saved alias |
| `/plugin help` | Show usage information |

### Fuzzy names

All commands that accept a plugin name support fuzzy matching:

- `vibeguard` matches `opencode-vibeguard`
- `browser` matches `@different-ai/opencode-browser`
- `mem` matches `opencode-mem@latest`
- `omo` matches `oh-my-opencode` (if you've set up that alias)

Exact matches take priority over substring matches.

### Aliases

Aliases are persistent shortcuts stored in `~/.config/opencode/plugins-aliases.json`.

```
/plugin alias omo oh-my-opencode
/plugin alias vg opencode-vibeguard

/plugin disable omo   → disables oh-my-opencode
/plugin enable vg     → enables opencode-vibeguard
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
/plugin disable vibeguard
  → removes "opencode-vibeguard" from opencode.json plugin array
  → appends "opencode-vibeguard" to plugins-disabled.json

/plugin enable vibeguard
  → removes "opencode-vibeguard" from plugins-disabled.json
  → appends "opencode-vibeguard" back to opencode.json plugin array
```

Changes take effect after restarting OpenCode.

### Hook implementation

The plugin registers itself using the `config` hook (no `.md` file needed) and intercepts commands via `command.execute.before`. It throws after sending its response to stop the hook chain — preventing downstream plugins from also processing the `/plugin` command.

```typescript
const OpmPlugin: Plugin = async ({ client }) => ({
  config: async (input) => {
    input.command["plugin"] = { ... };
  },
  "command.execute.before": async (input) => {
    if (input.command !== "plugin") return;
    // ... handle command ...
    await client.session.prompt({ path: { id: input.sessionID }, body: { noReply: true, ... } });
    throw new Error("Command handled by opm");
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
 34 pass
  0 fail
```
