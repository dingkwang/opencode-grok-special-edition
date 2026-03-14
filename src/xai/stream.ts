// XaiStream - streaming orchestrator that replaces Vercel AI SDK's streamText()
import type { ModelMessage, ToolSet } from "@/ai-stub"
import type { ChatCompletionRequest, ReasoningEffort, AgentCount, Tool as XaiTool, SearchParameters } from "./types"
import { XaiClient, createXaiClient } from "./client"
import { toXaiMessages, toXaiTools, chunkToEvents } from "./convert"
import type { StreamEvent } from "./events"
import { Log } from "@/util/log"

const log = Log.create({ service: "xai-stream" })

export interface StreamInput {
  model: string
  messages: ModelMessage[]
  systemPrompts?: string[]
  tools?: ToolSet
  serverTools?: XaiTool[]
  maxTokens?: number
  temperature?: number
  topP?: number
  reasoningEffort?: ReasoningEffort
  storeMessages?: boolean
  previousResponseId?: string
  maxTurns?: number
  agentCount?: AgentCount
  include?: string[]
  searchParameters?: SearchParameters
  abortSignal?: AbortSignal
  providerOptions?: Record<string, any>
  apiKey?: string
  baseUrl?: string
}

export namespace XaiStream {
  export async function* stream(input: StreamInput): AsyncGenerator<StreamEvent> {
    const client = createXaiClient({
      apiKey: input.apiKey,
      baseUrl: input.baseUrl,
    })

    // Build tool list: client-side function tools + server-side tools
    const tools: XaiTool[] = []
    if (input.tools) {
      tools.push(...toXaiTools(input.tools))
    }
    if (input.serverTools) {
      tools.push(...input.serverTools)
    }

    // Build include list
    const include: string[] = input.include ?? []

    // Build request
    const request: ChatCompletionRequest = {
      model: input.model,
      messages: toXaiMessages(input.messages, input.systemPrompts),
      stream: true,
      max_tokens: input.maxTokens,
      temperature: input.temperature,
      top_p: input.topP,
    }

    if (tools.length > 0) {
      request.tools = tools
    }
    if (input.reasoningEffort) {
      request.reasoning_effort = input.reasoningEffort
    }
    if (input.storeMessages !== undefined) {
      request.store_messages = input.storeMessages
    }
    if (input.previousResponseId) {
      request.previous_response_id = input.previousResponseId
    }
    if (input.maxTurns) {
      request.max_turns = input.maxTurns
    }
    if (input.agentCount) {
      request.agent_count = input.agentCount
    }
    if (include.length > 0) {
      request.include = include
    }
    if (input.searchParameters) {
      request.search_parameters = input.searchParameters
    }

    // Merge any additional provider options
    if (input.providerOptions) {
      Object.assign(request, input.providerOptions)
    }

    yield { type: "step-start" }

    // Accumulate tool call arguments for client-side tools
    const toolCallArgs = new Map<string, { name: string; args: string }>()

    try {
      for await (const chunk of client.chatStream(request, input.abortSignal)) {
        const events = chunkToEvents(chunk)

        for (const event of events) {
          if (event.type === "tool-call") {
            // Accumulate streaming tool call arguments
            const existing = toolCallArgs.get(event.toolCallId || "pending")
            if (existing) {
              existing.args += event.args
              if (event.toolName) existing.name = event.toolName
            } else if (event.toolCallId) {
              toolCallArgs.set(event.toolCallId, {
                name: event.toolName,
                args: event.args,
              })
            }
            continue // Don't yield individual arg chunks
          }

          yield event
        }

        // When we get a finish event, emit accumulated tool calls
        const finishEvent = events.find((e) => e.type === "finish-step")
        if (finishEvent && finishEvent.type === "finish-step" && finishEvent.finishReason === "tool_calls") {
          for (const [callId, call] of toolCallArgs) {
            yield {
              type: "tool-call",
              toolCallId: callId,
              toolName: call.name,
              args: call.args,
              toolCallType: "client_side_tool" as const,
            }
          }
          toolCallArgs.clear()
        }
      }
    } catch (error) {
      yield { type: "error", error: error instanceof Error ? error : new Error(String(error)) }
    }
  }
}
