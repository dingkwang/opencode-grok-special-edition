// Adapter: converts xAI StreamEvents into the AI-SDK-style fullStream events
// that processor.ts already knows how to consume.
// This lets us wire xAI into the existing processor without rewriting it.

import type { StreamEvent } from "./events"

type AISdkStreamEvent =
  | { type: "start" }
  | { type: "start-step" }
  | { type: "text-start"; providerMetadata?: any }
  | { type: "text-delta"; text: string; providerMetadata?: any }
  | { type: "text-end"; providerMetadata?: any }
  | { type: "reasoning-start"; id: string; providerMetadata?: any }
  | { type: "reasoning-delta"; id: string; text: string; providerMetadata?: any }
  | { type: "reasoning-end"; id: string; providerMetadata?: any }
  | { type: "tool-input-start"; id: string; toolName: string }
  | { type: "tool-input-delta"; id: string; delta: string }
  | { type: "tool-input-end"; id: string }
  | {
      type: "tool-call"
      toolCallId: string
      toolName: string
      input: any
      providerMetadata?: any
    }
  | {
      type: "tool-result"
      toolCallId: string
      toolName: string
      input: any
      output: any
    }
  | {
      type: "tool-error"
      toolCallId: string
      toolName: string
      input: any
      error: Error
    }
  | {
      type: "finish-step"
      finishReason: string
      usage: {
        inputTokens?: number
        outputTokens?: number
        totalTokens?: number
        reasoningTokens?: number
        cachedInputTokens?: number
      }
      providerMetadata?: any
    }
  | { type: "finish" }
  | { type: "error"; error: Error }

// Adapt xAI stream events to the AI SDK event model that processor.ts expects
export async function* adaptXaiStream(
  xaiEvents: AsyncGenerator<StreamEvent>,
): AsyncGenerator<AISdkStreamEvent> {
  let started = false
  let textStarted = false
  let reasoningStarted = false
  const reasoningId = "reasoning-0"
  const toolCallArgs = new Map<string, { name: string; args: string }>()

  for await (const event of xaiEvents) {
    switch (event.type) {
      case "step-start":
        if (!started) {
          yield { type: "start" }
          started = true
        }
        yield { type: "start-step" }
        break

      case "text-delta":
        if (!textStarted) {
          textStarted = true
          yield { type: "text-start" }
        }
        yield { type: "text-delta", text: event.textDelta }
        break

      case "reasoning-delta":
        if (!reasoningStarted) {
          reasoningStarted = true
          yield { type: "reasoning-start", id: reasoningId }
        }
        yield { type: "reasoning-delta", id: reasoningId, text: event.textDelta }
        break

      case "tool-call": {
        // Accumulate args for this tool call
        const existing = toolCallArgs.get(event.toolCallId)
        if (existing) {
          existing.args += event.args
          if (event.toolName) existing.name = event.toolName
        } else {
          toolCallArgs.set(event.toolCallId, {
            name: event.toolName,
            args: event.args,
          })
          // Emit tool-input-start
          yield {
            type: "tool-input-start",
            id: event.toolCallId,
            toolName: event.toolName,
          }
        }
        break
      }

      case "server-tool-start":
        // Server-side tools: create a tool part that tracks status
        yield {
          type: "tool-input-start",
          id: event.toolCallId,
          toolName: event.toolName,
        }
        // Immediately mark as "running" with server-side metadata
        yield {
          type: "tool-call",
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          input: {},
          providerMetadata: {
            xai: {
              serverSide: true,
              toolCallType: event.toolCallType,
            },
          },
        }
        break

      case "server-tool-end":
        if (event.status === "completed") {
          yield {
            type: "tool-result",
            toolCallId: event.toolCallId,
            toolName: "",
            input: {},
            output: {
              output: event.content ?? "Server-side tool completed",
              title: `Server Tool (${event.toolCallType})`,
              metadata: {
                serverSide: true,
                toolCallType: event.toolCallType,
              },
            },
          }
        } else {
          yield {
            type: "tool-error",
            toolCallId: event.toolCallId,
            toolName: "",
            input: {},
            error: new Error(event.errorMessage ?? `Server-side tool ${event.status}`),
          }
        }
        break

      case "server-tool-update":
        // Status update for in-progress server tools - no direct AI SDK equivalent
        break

      case "citation":
        // Citations don't have a direct AI SDK event equivalent
        // They'll be handled in Phase 7 TUI updates
        break

      case "finish-step":
        // End text/reasoning blocks if open
        if (textStarted) {
          yield { type: "text-end" }
          textStarted = false
        }
        if (reasoningStarted) {
          yield { type: "reasoning-end", id: reasoningId }
          reasoningStarted = false
        }

        // Emit accumulated tool calls as tool-call events
        for (const [callId, call] of toolCallArgs) {
          let parsedArgs: any = {}
          try {
            parsedArgs = JSON.parse(call.args)
          } catch {
            parsedArgs = call.args
          }
          yield {
            type: "tool-call",
            toolCallId: callId,
            toolName: call.name,
            input: parsedArgs,
          }
        }
        toolCallArgs.clear()

        yield {
          type: "finish-step",
          finishReason: event.finishReason,
          usage: {
            inputTokens: event.usage?.prompt_tokens,
            outputTokens: event.usage?.completion_tokens,
            totalTokens: event.usage?.total_tokens,
            reasoningTokens: event.usage?.reasoning_tokens,
            cachedInputTokens: event.usage?.cached_prompt_text_tokens,
          },
          providerMetadata: event.usage
            ? {
                xai: {
                  serverSideToolsUsed: event.usage.server_side_tools_used,
                  responseId: event.responseId,
                },
              }
            : undefined,
        }
        break

      case "error":
        yield { type: "error", error: event.error }
        break
    }
  }

  // Close any open blocks
  if (textStarted) yield { type: "text-end" }
  if (reasoningStarted) yield { type: "reasoning-end", id: reasoningId }
  yield { type: "finish" }
}

// Wrap the adapted stream as an object with fullStream property
// to match what processor.ts expects from LLM.stream()
export function wrapAsFullStream(adapted: AsyncGenerator<AISdkStreamEvent>) {
  return {
    fullStream: adapted,
  }
}
