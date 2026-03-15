# OpenCode Grok Special Edition

Fork of [OpenCode](https://github.com/anomalyco/opencode) stripped to Grok-only, using a native xAI client instead of the Vercel AI SDK.

## Architecture

### `src/xai/` — Native xAI Client Layer
Replaces the Vercel AI SDK (`ai`, `@ai-sdk/*`) with direct xAI REST API calls.

- **types.ts** — TypeScript types from xAI v6 proto stubs (request/response/streaming/tool types)
- **client.ts** — HTTP client (`fetch`-based) for `api.x.ai/v1`. Handles chat, streaming (SSE), deferred, and stored responses
- **convert.ts** — Converts between internal `ModelMessage[]` and xAI `Message[]` formats. Also converts `ToolSet` to xAI `Tool[]`
- **stream.ts** — `XaiStream.stream()` — main streaming orchestrator replacing `streamText()`. Builds `ChatCompletionRequest`, yields `StreamEvent`s
- **events.ts** — Stream event union type (text-delta, reasoning-delta, tool-call, server-tool-*, citation, finish-step, etc.)
- **adapter.ts** — Converts xAI `StreamEvent` → AI-SDK-style events so `processor.ts` works unchanged
- **server-tools.ts** — Converts `serverTools` config → xAI `Tool[]` objects for server-side tools (web search, X search, code execution, collections, MCP, attachments)

### `src/ai-stub.ts` — AI SDK Stub
Exports stub types/functions (`ModelMessage`, `Tool`, `ToolSet`, `streamText`, etc.) so files that imported from `"ai"` compile without the actual package. Only type-level — runtime calls throw.

### Key Modified Files
- **session/llm.ts** — Uses `XaiStream` + `adaptXaiStream` instead of `streamText()`. Passes server tools, search params, `previousResponseId`, `agentCount`
- **session/processor.ts** — Captures `responseId` from xAI finish events onto assistant messages
- **session/prompt.ts** — Passes `previousResponseId` for server-side session continuity
- **session/message-v2.ts** — Added `responseId` on assistant messages, `CitationPart` for inline citations
- **provider/provider.ts** — Stripped to Grok-only provider resolution
- **provider/models.ts** — Static `GROK_MODELS` registry (grok-3, grok-3-mini, grok-4, grok-4-fast, grok-code-fast-1)
- **provider/transform.ts** — Stripped provider-specific transforms, kept Grok reasoning effort variants
- **agent/agent.ts** — `generate()` uses `XaiClient` directly. Agent schema includes per-agent `serverTools` overrides
- **config/config.ts** — Added `serverTools`, `searchParameters`, `storeMessages`, `maxTurns`, `agentCount`, `include` config schemas
- **session/instruction.ts** — Loads `.grok/GROK.md` for project/global custom instructions

### Config: Server-Side Tools
Configured in `opencode-grok.json` under `serverTools`:
```json
{
  "serverTools": {
    "webSearch": { "enabled": true },
    "codeExecution": { "enabled": true }
  }
}
```
Per-agent overrides use boolean toggles in the agent config's `serverTools` field.

### Environment Variables
- `XAI_API_KEY` — required, xAI API key
- `GROK_ENDPOINT` — optional, custom API base URL
