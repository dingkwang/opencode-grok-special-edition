# opencode-grok-special-edition

A Grok-only fork of [OpenCode](https://github.com/anomalyco/opencode) — the open source AI coding agent — packaged as `opencode-grok-special-edition` and stripped down to use xAI's native API directly instead of the Vercel AI SDK.

This gives full access to xAI-specific features that generic provider abstractions can't expose: server-side tools (web search, X search, code execution, collections, MCP, attachments), inline citations, server-side session persistence, multi-agent, and agentic loops.

## Quickstart

```bash
# Set your xAI API key
export XAI_API_KEY="xai-..."

# Install the latest release binary
curl -fsSL https://raw.githubusercontent.com/dingkwang/opencode-grok-special-edition/main/install.sh | bash

# Run from source
bun install
bun run dev

# Or build a standalone binary
bun run build
./dist/opencode-grok-$(uname -s | tr A-Z a-z)-$(uname -m | sed 's/x86_64/x64/')/bin/opencode-grok
```

Install a specific release:

```bash
curl -fsSL https://raw.githubusercontent.com/dingkwang/opencode-grok-special-edition/main/install.sh | VERSION=0.1.3 bash
```

The installer downloads the matching GitHub Release binary for your platform and installs `opencode-grok` to `~/.local/bin` by default.

## Building

```bash
bun run build        # Build for current platform
bun run build:all    # Build for all platforms (linux arm64/x64, darwin arm64/x64)
```

The binary is output to `dist/opencode-grok-<platform>-<arch>/bin/opencode-grok`.

## Releases

GitHub releases are published from tags like `v0.1.3` and include standalone tarballs built by GitHub Actions.

Current published targets:

- `opencode-grok-linux-x64.tar.gz`
- `opencode-grok-linux-x64-baseline.tar.gz`
- `opencode-grok-linux-arm64.tar.gz`
- `opencode-grok-darwin-arm64.tar.gz`

Release page:

```text
https://github.com/dingkwang/opencode-grok-special-edition/releases
```

Latest release example:

```text
https://github.com/dingkwang/opencode-grok-special-edition/releases/tag/v0.1.3
```

## Configuration

Config is loaded from these locations (low to high precedence):

1. `~/.config/opencode-grok/opencode-grok.json` — global config
2. `OPENCODE_CONFIG` env var — custom config path
3. `opencode-grok.json` in your project directory (walks up to git root)
4. `.opencode-grok/opencode-grok.json` directories
5. `OPENCODE_CONFIG_CONTENT` env var — inline JSON

Example `opencode-grok.json`:

```jsonc
{
  // Server-side tools (executed by xAI, not locally)
  "serverTools": {
    "webSearch": { "enabled": true },
    "xSearch": { "enabled": false },
    "codeExecution": { "enabled": true },
    "collectionsSearch": { "enabled": false, "collectionIds": [] },
    "mcp": {
      "enabled": false,
      "servers": [{ "serverUrl": "...", "serverLabel": "..." }]
    },
    "attachmentSearch": { "enabled": false }
  },

  // Search parameters
  "searchParameters": {
    "mode": "auto",
    "returnCitations": true
  },

  // Session persistence
  "storeMessages": true,

  // Multi-agent
  "agentCount": 4,       // 4 or 16 parallel server-side agents
  "maxTurns": 10,        // Server-side agentic loop limit

  // Per-agent overrides
  "agent": {
    "build": {
      "model": "xai/grok-4",
      "serverTools": {
        "webSearch": true,
        "codeExecution": true
      }
    }
  }
}
```

### Environment Variables

| Variable | Description |
|---|---|
| `XAI_API_KEY` | **Required.** Your xAI API key |
| `GROK_ENDPOINT` | Custom API base URL (default: `https://api.x.ai/v1`) |

### Custom Instructions

`opencode-grok-special-edition` loads instruction files from these locations:

- `GROK.md` — project-level (walks up from cwd)
- `~/.grok/GROK.md` — global
- `CLAUDE.md`, `AGENTS.md` — also supported (inherited from OpenCode)

## Grok-Exclusive Features

These features are only available through xAI's native API and cannot be accessed via generic provider abstractions like the Vercel AI SDK.

### Server-Side Tools

Tools executed on xAI's servers — no local resources consumed. The model decides when to call them automatically based on the conversation.

| Tool | Purpose | Config Key |
|---|---|---|
| Web Search | Real-time internet search | `webSearch` |
| X Search | Search X/Twitter posts | `xSearch` |
| Code Execution | Sandboxed code execution on xAI servers | `codeExecution` |
| Collections Search | Search your uploaded document collections | `collectionsSearch` |
| Server-Side MCP | xAI-hosted MCP server calls | `mcp` |
| Attachment Search | Search file attachments | `attachmentSearch` |

Enable in `opencode-grok.json`:

```jsonc
{
  "serverTools": {
    "webSearch": {
      "enabled": true,
      "allowedDomains": ["github.com", "stackoverflow.com"]
    },
    "codeExecution": { "enabled": true },
    "xSearch": {
      "enabled": true,
      "fromDate": "2025-01-01",
      "allowedHandles": ["elonmusk"]
    }
  }
}
```

### Inline Citations

When `webSearch` or `xSearch` is enabled, model responses automatically include source references (URLs, tweet links) rendered as a `Citations:` block in the TUI.

```jsonc
{
  "searchParameters": {
    "returnCitations": true
  }
}
```

### Server-Side Session Persistence

xAI remembers previous conversation turns server-side via `previous_response_id`, reducing token transmission on each request.

```jsonc
{
  "storeMessages": true
}
```

Works automatically once enabled — each assistant response saves its `responseId`, and the next request includes it.

### Multi-Agent (Parallel)

Spin up multiple xAI agent instances to process the same query in parallel; the best result is selected.

```jsonc
{
  "agentCount": 4    // or 16
}
```

### Server-Side Agentic Loop

The model autonomously loops through tool calls on xAI's servers (e.g., search -> read -> search again) without client round-trips.

```jsonc
{
  "maxTurns": 10
}
```

### Per-Agent Server Tool Overrides

Different agents can have different server-side tools enabled:

```jsonc
{
  "serverTools": {
    "webSearch": { "enabled": true },
    "codeExecution": { "enabled": true }
  },
  "agent": {
    "build": {
      "serverTools": { "webSearch": true, "codeExecution": true }
    },
    "plan": {
      "serverTools": { "webSearch": true, "codeExecution": false }
    }
  }
}
```

### Reasoning Effort

Control Grok's reasoning depth via model variants:

```jsonc
{
  "provider": {
    "xai": {
      "models": {
        "grok-3": {
          "variants": {
            "think": { "reasoningEffort": "high" },
            "fast": { "reasoningEffort": "low" }
          }
        }
      }
    }
  }
}
```

### GROK.md Custom Instructions

In addition to `CLAUDE.md` and `AGENTS.md`, Grok Code loads:
- `./GROK.md` — project-level (walks up to git root)
- `~/.grok/GROK.md` — global

### Minimal Quick-Start Config

```jsonc
// opencode-grok.json
{
  "serverTools": {
    "webSearch": { "enabled": true },
    "codeExecution": { "enabled": true }
  },
  "storeMessages": true,
  "searchParameters": {
    "returnCitations": true
  }
}
```

No manual triggering needed — the model automatically invokes server-side tools when relevant to the conversation.

## Models

Static model registry (no external API calls):

| Model | ID |
|---|---|
| Grok 4.20 Beta | `xai/grok-4.20-beta-latest` |
| Grok 4.20 Beta Non-Reasoning | `xai/grok-4.20-beta-latest-non-reasoning` |
| Grok 4.20 Multi-Agent Beta | `xai/grok-4.20-multi-agent-beta-0309` |
| Grok 4 | `xai/grok-4` |
| Grok 4 Fast | `xai/grok-4-fast` |
| Grok 3 | `xai/grok-3` |
| Grok 3 Mini | `xai/grok-3-mini` |
| Grok Code Fast | `xai/grok-code-fast-1` |

`xai/grok-4.20-multi-agent-beta-0309` is wired as a server-tools-first model: this fork does not send local custom tools to it, because xAI documents the multi-agent beta as using built-in server-side tools rather than client-side custom tools.

## Architecture

Forked from OpenCode with these key changes:

- **Vercel AI SDK removed** — all `ai` and `@ai-sdk/*` imports replaced with a thin stub (`src/ai-stub.ts`)
- **Native xAI client** (`src/xai/`) — direct HTTP/SSE calls to `api.x.ai/v1`
- **Adapter layer** (`src/xai/adapter.ts`) — converts xAI stream events to AI-SDK-style events so the existing processor, tool executor, and TUI work unchanged
- **Server-side tool config** (`src/xai/server-tools.ts`) — maps config to xAI `Tool[]` objects
- **Static model registry** — no `models.dev` fetch, just a hardcoded list of Grok models

See [AGENTS.md](./AGENTS.md) for detailed architecture notes.

## Agents

Same as OpenCode — two built-in agents switchable with `Tab`:

- **build** — full-access agent for development
- **plan** — read-only agent for analysis and exploration

## Credits

Built on top of [OpenCode](https://github.com/anomalyco/opencode) by [Anomaly](https://anomaly.co). All OpenCode features (TUI, MCP, LSP, tree-sitter, tools, permissions, sessions, etc.) are preserved.
