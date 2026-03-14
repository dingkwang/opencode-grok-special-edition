// Message conversion between OpenCode's MessageV2 parts and xAI request/response format
import type { ModelMessage, Tool as AITool, ToolSet } from "@/ai-stub"
import type {
  Message,
  Content,
  Tool,
  FunctionDef,
  ChatCompletionChunk,
  ToolCallType,
} from "./types"
import type { StreamEvent } from "./events"

// Convert OpenCode ModelMessages to xAI Message format
export function toXaiMessages(messages: ModelMessage[], systemPrompts?: string[]): Message[] {
  const result: Message[] = []

  // Add system messages first
  if (systemPrompts?.length) {
    for (const prompt of systemPrompts) {
      result.push({ role: "system", content: prompt })
    }
  }

  for (const msg of messages) {
    if (msg.role === "system") {
      result.push({ role: "system", content: typeof msg.content === "string" ? msg.content : "" })
      continue
    }

    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        result.push({ role: "user", content: msg.content })
      } else if (Array.isArray(msg.content)) {
        const parts: Content[] = []
        for (const part of msg.content) {
          if (part.type === "text") {
            parts.push({ type: "text", text: part.text })
          } else if (part.type === "image") {
            parts.push({
              type: "image_url",
              image_url: { url: part.image.toString() },
            })
          } else if (part.type === "file") {
            if (part.mediaType?.startsWith("image/")) {
              parts.push({
                type: "image_url",
                image_url: { url: part.url ?? `data:${part.mediaType};base64,${part.data}` },
              })
            } else {
              parts.push({ type: "text", text: `[File: ${part.filename ?? "unknown"}]` })
            }
          }
        }
        result.push({ role: "user", content: parts })
      }
      continue
    }

    if (msg.role === "assistant") {
      if (typeof msg.content === "string") {
        result.push({ role: "assistant", content: msg.content })
      } else if (Array.isArray(msg.content)) {
        const textParts: string[] = []
        const toolCalls: Array<{
          id: string
          type: "function"
          function: { name: string; arguments: string }
        }> = []
        let reasoningContent: string | undefined

        for (const part of msg.content) {
          if (part.type === "text") {
            textParts.push(part.text)
          } else if (part.type === "reasoning") {
            reasoningContent = (reasoningContent ?? "") + part.text
          } else if (part.type === "tool-call") {
            toolCalls.push({
              id: part.toolCallId,
              type: "function",
              function: {
                name: part.toolName,
                arguments: typeof part.args === "string" ? part.args : JSON.stringify(part.args),
              },
            })
          }
        }

        const message: Message = {
          role: "assistant",
          content: textParts.join("") || null as any,
        }
        if (reasoningContent) message.reasoning_content = reasoningContent
        if (toolCalls.length > 0) message.tool_calls = toolCalls as any
        result.push(message)
      }
      continue
    }

    if (msg.role === "tool") {
      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === "tool-result") {
            const content = typeof part.result === "string"
              ? part.result
              : part.result?.type === "text"
                ? part.result.value
                : JSON.stringify(part.result)
            result.push({
              role: "tool",
              tool_call_id: part.toolCallId,
              content,
            })
          }
        }
      }
    }
  }

  return result
}

// Convert OpenCode tools to xAI Tool format
export function toXaiTools(clientTools: ToolSet): Tool[] {
  const tools: Tool[] = []

  for (const [name, tool] of Object.entries(clientTools)) {
    if (!tool) continue
    const fn: FunctionDef = {
      name,
      description: tool.description,
    }
    if (tool.inputSchema) {
      fn.parameters = tool.inputSchema
    }
    tools.push({ type: "function", function: fn })
  }

  return tools
}

// Determine if a tool call is server-side based on its type
function isServerSideToolCall(type?: ToolCallType): boolean {
  if (!type) return false
  return type !== "client_side_tool"
}

// Convert an xAI streaming chunk to StreamEvents
export function chunkToEvents(chunk: ChatCompletionChunk): StreamEvent[] {
  const events: StreamEvent[] = []

  for (const choice of chunk.choices) {
    const delta = choice.delta

    // Text content
    if (delta.content) {
      events.push({ type: "text-delta", textDelta: delta.content })
    }

    // Reasoning content
    if (delta.reasoning_content) {
      events.push({ type: "reasoning-delta", textDelta: delta.reasoning_content })
    }

    // Tool calls
    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        if (tc.id && tc.function?.name) {
          // New tool call starting
          const toolCallType = tc.type ?? "client_side_tool"

          if (isServerSideToolCall(tc.type)) {
            events.push({
              type: "server-tool-start",
              toolCallId: tc.id,
              toolCallType: toolCallType as ToolCallType,
              toolName: tc.function.name,
            })
          } else {
            // Client-side tool call - accumulate args then emit when complete
            events.push({
              type: "tool-call",
              toolCallId: tc.id,
              toolName: tc.function.name,
              args: tc.function.arguments ?? "",
              toolCallType: toolCallType as ToolCallType,
            })
          }
        } else if (tc.function?.arguments) {
          // Continuation of tool call arguments (streaming args)
          events.push({
            type: "tool-call",
            toolCallId: tc.id ?? "",
            toolName: tc.function?.name ?? "",
            args: tc.function.arguments,
          })
        }

        // Server-side tool status updates
        if (tc.status && tc.type && isServerSideToolCall(tc.type)) {
          if (tc.status === "completed" || tc.status === "failed" || tc.status === "incomplete") {
            events.push({
              type: "server-tool-end",
              toolCallId: tc.id ?? "",
              toolCallType: tc.type as ToolCallType,
              status: tc.status,
              errorMessage: tc.error_message,
            })
          } else {
            events.push({
              type: "server-tool-update",
              toolCallId: tc.id ?? "",
              toolCallType: tc.type as ToolCallType,
              status: tc.status,
            })
          }
        }
      }
    }

    // Citations
    if (delta.citations) {
      for (const citation of delta.citations) {
        events.push({ type: "citation", citation })
      }
    }

    // Finish reason
    if (choice.finish_reason) {
      events.push({
        type: "finish-step",
        finishReason: choice.finish_reason,
        usage: chunk.usage ?? undefined,
        responseId: chunk.id,
      })
    }
  }

  return events
}
