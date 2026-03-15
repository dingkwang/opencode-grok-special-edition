# Grok-Code: OpenCode Fork with Native xAI gRPC Support

## Context

OpenCode is a TypeScript coding CLI that supports 25+ LLM providers via the Vercel AI SDK. When used with xAI/Grok, it treats Grok as just another "OpenAI-compatible model" — all tools execute client-side, and none of xAI's unique server-side capabilities (web search, X search, code execution, server-side MCP, multi-agent, agentic loops) are used.

**Goal**: Fork OpenCode into an independent "grok-code" project that replaces the generic Vercel AI SDK layer with a native gRPC client for xAI's `xai_api.Chat` service, enabling full access to xAI-specific features that no other coding CLI offers.

**Key value over a "just delete other providers" approach**: The new capabilities (server-side code execution, server-side MCP, agentic loops, multi-agent) fundamentally change how the CLI works — the model can validate code in a sandbox before editing user files, search the web autonomously, and run multi-step research tasks entirely server-side.

---

## Phase 0: Fork and Strip

**Goal**: Independent grok-code repo that compiles with only xAI/Grok support.

**Status**: NOT STARTED

### Steps

1. **Fork OpenCode monorepo**, flatten `packages/opencode/` to repo root (drop `packages/app`, `packages/desktop`, `packages/console`, etc.)

2. **Remove multi-provider infrastructure**:
   - `src/provider/provider.ts` — delete `BUNDLED_PROVIDERS` map, `getSDK()`, `getLanguage()`, dynamic provider loading
   - `src/provider/transform.ts` — delete all non-xAI transforms (Anthropic thinking, Google thinkingConfig, OpenAI store/caching, etc.)
   - `src/provider/models.ts` — delete models.dev fetch, replace with static Grok model registry

3. **Remove the `ai` (Vercel AI SDK) dependency** — affects:
   - `src/session/llm.ts` — calls `streamText()` (line 172)
   - `src/session/processor.ts` — iterates `stream.fullStream`
   - `src/session/prompt.ts` — uses `tool()`, `jsonSchema()`, `asSchema()`
   - `src/session/message-v2.ts` — uses `convertToModelMessages()`
   - `src/mcp/index.ts` — uses `dynamicTool()`, `jsonSchema()`
   - `src/tool/tool.ts` — tool definition pattern

4. **Remove all `@ai-sdk/*` packages** from package.json (18+ packages)

5. **Simplify auth** to xAI-only: `XAI_API_KEY` env var or config file

6. **Rename**: package name → `grok-code`, CLI binary → `grok`, branding → "Grok Code"

**Deliverable**: Repo compiles with stub imports where AI SDK was used. TUI launches but no LLM calls work.

**Test**: `bun run typecheck` passes. TUI renders session list.

---

## Phase 1: gRPC Client and Proto Generation

**Goal**: Working TypeScript gRPC client that streams from `xai_api.Chat/GetCompletionChunk`.

**Status**: NOT STARTED

### Steps

1. **Reconstruct `.proto` files** from Python SDK stubs at:
   - Source: `xai-sdk-python/src/xai_sdk/proto/v6/chat_pb2.pyi` (703 lines, full field numbers and types)
   - Protos needed: `chat.proto`, `usage.proto`, `deferred.proto`, `image.proto`, `sample.proto`, `documents.proto`

2. **Generate TS types with `ts-proto`**:
   - New dirs: `src/proto/` (source), `src/generated/` (output)
   - Script: `"proto:gen": "protoc --plugin=protoc-gen-ts_proto ... --ts_proto_opt=outputServices=grpc-js,esModuleInterop=true src/proto/*.proto"`
   - Output: pure TS interfaces + gRPC client stubs for `@grpc/grpc-js`

3. **Implement gRPC client** at `src/grpc/client.ts`:
   ```
   GrokGrpc.createChannel(config) → grpc.Channel (TLS + Bearer auth)
   GrokGrpc.createChatClient(channel) → ChatClient
   GrokGrpc.streamCompletion(client, request, abort?) → AsyncGenerator<GetChatCompletionChunk>
   GrokGrpc.getCompletion(client, request) → GetChatCompletionResponse
   GrokGrpc.startDeferred / getDeferred / getStored / deleteStored
   ```

4. **Add deps**: `@grpc/grpc-js`, `ts-proto` (dev)

**Deliverable**: Standalone gRPC client, testable independently.

**Test**: Smoke test script sends "Hello" to xAI, prints streamed text deltas.

---

## Phase 2: Streaming Abstraction and Message Conversion

**Goal**: Replace Vercel AI SDK's `streamText()` with custom streaming layer.

**Status**: NOT STARTED

### Steps

1. **Define stream events** at `src/stream/events.ts` — superset of AI SDK events:
   ```
   text-delta, reasoning-delta, tool-call, tool-result, tool-error  (existing)
   server-tool-start/update/end  (NEW: server-side tool lifecycle)
   citation                      (NEW: inline citations)
   finish-step with xAI Usage    (EXTENDED: reasoning_tokens, cached_tokens, etc.)
   ```
   Key addition: `tool-call` event gets `toolCallType` field to distinguish `CLIENT_SIDE_TOOL` from server-side types.

2. **Message conversion** at `src/grpc/convert.ts`:
   ```
   MessageConvert.toProtoMessages(messages, systemPrompts) → proto Message[]
   MessageConvert.toProtoTools(clientTools, serverToolConfig) → proto Tool[]
   MessageConvert.deltaToEvents(chunk) → StreamEvent[]
   ```
   Mapping: OpenCode's `MessageV2` parts → proto `Content[]`, tool parts → proto `ToolCall[]`, tool results → proto `ROLE_TOOL` messages.

3. **Streaming orchestrator** at `src/grpc/stream.ts` — replaces `LLM.stream()`:
   ```
   GrokStream.stream(input: StreamInput) → AsyncGenerator<StreamEvent>
   ```
   StreamInput includes xAI-specific fields: `storeMessages`, `previousResponseId`, `maxTurns`, `agentCount`, `include`.

4. **Static model registry** at `src/provider/models.ts`:
   - Hardcoded Grok models: grok-3, grok-3-mini, grok-4, grok-4-fast, grok-code-fast-1, etc.
   - Each with: id, name, reasoning flag, contextWindow, maxOutput, cost

**Deliverable**: gRPC streaming pipeline converts messages and yields typed events.

**Test**: Integration test: send message → verify text-delta events. Test with client-side tool call to verify round-trip.

---

## Phase 3: Processor Adaptation for Mixed Tool Model

**Goal**: Agent loop handles both client-side tools (local execution) and server-side tools (status tracking from stream).

**Status**: NOT STARTED

### Critical files to modify:
- `src/session/processor.ts` — consume `AsyncGenerator<StreamEvent>` instead of AI SDK's `fullStream`
- `src/session/prompt.ts` — adapt `while(true)` loop (line 294) for mixed client/server tool model
- `src/session/message-v2.ts` — add `CitationPart`, `responseId` field

### Steps

1. **Modify processor.ts switch statement** to handle new events:
   - `server-tool-start` → create ToolPart with `metadata: { serverSide: true }`, status "running"
   - `server-tool-end` → update ToolPart to "completed"/"error"
   - `citation` → store as new CitationPart on message
   - `tool-call` → check `toolCallType`: if `CLIENT_SIDE_TOOL` → execute locally (existing flow); if server-side → do NOT execute, just track status

2. **Adapt agent loop in prompt.ts**:
   - Server-side tools are handled within the same stream (xAI loops internally when `max_turns > 1`)
   - Local loop only re-calls for client-side tool results
   - If a step has ONLY server-side tool calls → no local re-call needed

3. **Add `CitationPart`** to message-v2.ts:
   ```
   { type: "citation", citation: { id, startIndex, endIndex, source: web|x|collection } }
   ```

4. **Add `responseId`** to assistant message schema for server-side persistence tracking.

5. **Keep tool registry as-is** for client-side tools. Server-side tools are NOT in the registry — they're passed directly in the gRPC request as proto `Tool` objects.

**Deliverable**: Agent loop works end-to-end with mixed client/server tools.

**Test**:
- Mock gRPC stream with client-side tool-call → verify local execution
- Mock gRPC stream with server-side web_search → verify ToolPart created with `serverSide: true`, no local execution
- Integration: query triggering web search → verify citations appear

---

## Phase 4: Server-Side Tool Configuration

**Goal**: All 7 xAI tool types configurable.

**Status**: NOT STARTED

### Steps

1. **Server tool config schema** at `src/config/server-tools.ts`:
   ```json
   {
     "serverTools": {
       "webSearch": { "enabled": true, "allowedDomains": [...] },
       "xSearch": { "enabled": false },
       "codeExecution": { "enabled": true },
       "collectionsSearch": { "enabled": false, "collectionIds": [...] },
       "mcp": { "servers": [{ "serverUrl": "...", "serverLabel": "..." }] },
       "attachmentSearch": { "enabled": false }
     }
   }
   ```

2. **Integrate into config.ts**: Add `serverTools` to config schema

3. **Wire into GrokStream.stream()**: Convert config → proto `Tool[]`, append to request alongside client-side `Function` tools

4. **Per-agent server tool profiles**: Allow agents to specify which server tools they want (e.g., `build` agent enables all, `plan` agent only enables web_search)

5. **Search parameters**: Map config to `search_parameters` field on request (mode, sources, dateRange)

**Deliverable**: All server tool types configurable via `grok-code.json`.

**Test**: Integration tests for web_search, x_search, code_execution triggers.

---

## Phase 5: Server-Side Session Persistence

**Goal**: Use `store_messages`/`previous_response_id` for conversation continuity.

**Status**: NOT STARTED

### Steps

1. **Track response ID**: After stream completes, store `id` from chunk on assistant message record

2. **Use `previous_response_id`** on subsequent requests when session has prior response ID → reduces prompt tokens

3. **Config option**: `storeMessages: true/false` in config

4. **Hybrid persistence**: Keep SQLite locally + use `previous_response_id` server-side. Best of both worlds.

5. **CLI commands**: `grok stored list`, `grok stored delete <id>`

**Deliverable**: Multi-turn conversations use `previous_response_id` to reduce token usage.

**Test**: Start multi-turn conversation with `storeMessages: true`. Verify prompt_tokens decreases on second turn.

---

## Phase 6: Multi-Agent and Agentic Loop

**Goal**: Expose `max_turns` and `agent_count` capabilities.

**Status**: NOT STARTED

### Steps

1. **`maxTurns` config**: When > 1, xAI server handles server-side tool loops internally. Processor already handles this via `server-tool-*` events from Phase 3.

2. **`agentCount` config** (4 or 16): Server runs parallel agents. Streaming chunks have `output.index` to differentiate agents.
   - Group stream events by `output.index`
   - Add `AgentTrackPart` to message-v2 for per-agent outputs

3. **Include options config**: Map `includeToolOutputs`, `inlineCitations`, `verboseStreaming` to proto `IncludeOption` enums.

**Deliverable**: Users can configure `maxTurns` and `agentCount`.

**Test**: Query with `maxTurns: 5` + server-side tools → verify multi-round. Query with `agentCount: 4` → verify multi-agent output tracking.

---

## Phase 7: TUI Updates

**Goal**: Display all xAI-specific features visually.

**Status**: NOT STARTED

### Steps

1. **Server-side tool rendering**: Same ToolPart component but with cloud badge for `metadata.serverSide: true`. Tool-type-specific rendering (search results, code output, etc.)

2. **Citation rendering**: Superscript numbers in text + citation list at bottom. Link web citations as clickable URLs.

3. **Multi-agent view**: Tabs or split panel per agent track when `agentCount > 1`

4. **Extended usage display**: Show `reasoning_tokens`, `cached_prompt_text_tokens`, `server_side_tools_used`

5. **Grok-only model selector**: Replace multi-provider picker with Grok model list

**Deliverable**: TUI renders all xAI features.

**Test**: Manual QA for each feature.

---

## Phase 8: Config and Polish

**Status**: NOT STARTED

1. **Finalize `grok-code.json` schema**:
   ```json
   {
     "model": "grok-3",
     "endpoint": "api.x.ai:443",
     "reasoningEffort": "medium",
     "serverTools": { ... },
     "storeMessages": false,
     "maxTurns": 1,
     "agentCount": null,
     "temperature": 0.7,
     "maxTokens": 32000
   }
   ```

2. **Env vars**: `XAI_API_KEY`, `GROK_MODEL`, `GROK_ENDPOINT`, `GROK_MAX_TOKENS`

3. **Custom instructions**: `.grok/GROK.md` (project), `~/.grok/GROK.md` (global)

4. **Deferred completions CLI**: `grok deferred <requestId>` for long-running requests

---

## Dependency Changes

| Removed | Added |
|---|---|
| `ai` (Vercel AI SDK v5) | `@grpc/grpc-js` |
| 18+ `@ai-sdk/*` packages | `ts-proto` (dev) |
| `@openrouter/ai-sdk-provider` | |

**Kept**: `zod`, `drizzle-orm`, `remeda`, `@modelcontextprotocol/sdk`, SolidJS/OpenTUI, tree-sitter, all tool deps.

---

## Architecture Decision: Why Replace AI SDK Entirely

`LanguageModelV2` has no concept of:
- Server-side tools (tool calls that the LLM backend executes, not the client)
- Tool call types/status (ToolCallType enum, ToolCallStatus enum)
- Inline citations with position info
- Multi-agent outputs (agent_count, output.index)
- Stored responses / conversation branching (previous_response_id)
- Encrypted content (for ZDR users)

Wrapping gRPC as a LanguageModelV2 would lose all these capabilities. Direct gRPC with custom StreamEvent types gives full protocol access.

---

## Verification Plan

1. **Phase 0**: `bun run typecheck` passes, TUI launches
2. **Phase 1**: gRPC smoke test prints streamed text from Grok
3. **Phase 2**: End-to-end message send → receive text response
4. **Phase 3**: `grok "list files in current directory"` → bash tool executes locally; `grok "search for React 19 changes"` → web_search executes server-side
5. **Phase 4**: All 7 server tool types configurable and functional
6. **Phase 5**: Multi-turn conversation uses previous_response_id, prompt_tokens decreases
7. **Phase 6**: Multi-agent query shows parallel agent outputs
8. **Phase 7-8**: Full TUI rendering, config finalized
