// XaiStream - streaming orchestrator that replaces Vercel AI SDK's streamText()
import type { ModelMessage, ToolSet } from "@/ai-stub"
import type {
  ChatCompletionRequest,
  ReasoningEffort,
  AgentCount,
  Tool as XaiTool,
  SearchParameters,
  ResponsesOutputItem,
} from "./types"
import { createXaiClient } from "./client"
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

    const responseSearchTools = (input.serverTools ?? [])
      .filter((tool) => tool.type === "web_search" || tool.type === "x_search")
      .map((tool) => toResponsesSearchTool(tool))
    const responseFunctionTools = input.tools ? toResponsesFunctionTools(input.tools) : []
    const unsupportedServerTools = (input.serverTools ?? []).filter(
      (tool) =>
        tool.type === "code_execution" ||
        tool.type === "collections_search" ||
        tool.type === "mcp" ||
        tool.type === "attachment_search",
    )

    if (unsupportedServerTools.length > 0) {
      yield {
        type: "error",
        error: new Error(
          `Unsupported xAI server tools for the current REST backend: ${unsupportedServerTools
            .map((tool) => tool.type)
            .join(", ")}. Only web_search and x_search are currently routed through the supported Responses API path.`,
        ),
      }
      return
    }

    if (responseSearchTools.length > 0) {
      try {
        const response = await client.responses({
          model: input.model,
          input: toXaiMessages(input.messages, input.systemPrompts) as any,
          tools: [...responseFunctionTools, ...responseSearchTools] as any,
          store: false,
          previous_response_id: input.previousResponseId,
          temperature: input.temperature,
          top_p: input.topP,
        })

        let hasFunctionCalls = false
        for (const item of response.output) {
          if (item.type === "function_call") {
            hasFunctionCalls = true
            yield {
              type: "tool-call",
              toolCallId: item.call_id ?? item.id ?? "function-call",
              toolName: item.name ?? "function",
              args: item.arguments ?? "{}",
              toolCallType: "client_side_tool",
            }
          }

          if (item.type === "custom_tool_call") {
            const toolCallType = inferResponseToolCallType(item)
            yield {
              type: "server-tool-start",
              toolCallId: item.call_id ?? item.id ?? "server-tool",
              toolCallType,
              toolName: item.name ?? toolCallType,
            }
            yield {
              type: "server-tool-end",
              toolCallId: item.call_id ?? item.id ?? "server-tool",
              toolCallType,
              status: item.status === "completed" ? "completed" : "failed",
              content: item.input,
            }
          }

          if (item.type === "message" && item.role === "assistant" && item.content) {
            for (const part of item.content) {
              if (part.type === "output_text" && part.text) {
                yield { type: "text-delta", textDelta: part.text }
              }
            }
          }
        }

        yield {
          type: "finish-step",
          finishReason:
            response.status === "completed"
              ? hasFunctionCalls
                ? "tool_calls"
                : "stop"
              : response.status,
          usage: response.usage
            ? {
                prompt_tokens: response.usage.input_tokens,
                completion_tokens: response.usage.output_tokens,
                total_tokens: response.usage.total_tokens,
                reasoning_tokens: response.usage.output_tokens_details?.reasoning_tokens,
                cached_prompt_text_tokens: response.usage.input_tokens_details?.cached_tokens,
                server_side_tools_used: [
                  ...(response.usage.server_side_tool_usage_details?.web_search_calls ? ["web_search"] : []),
                  ...(response.usage.server_side_tool_usage_details?.x_search_calls ? ["x_search"] : []),
                ] as any,
              }
            : undefined,
          responseId: response.id,
        }
      } catch (error) {
        yield { type: "error", error: error instanceof Error ? error : new Error(String(error)) }
      }
      return
    }

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

function inferResponseToolCallType(item: ResponsesOutputItem) {
  if (item.name?.startsWith("x_")) return "x_search_tool" as const
  if (item.name?.startsWith("web_")) return "web_search_tool" as const
  if (item.call_id?.startsWith("xs_")) return "x_search_tool" as const
  return "web_search_tool" as const
}

function toResponsesSearchTool(tool: XaiTool) {
  if (tool.type === "web_search") {
    return {
      type: "web_search",
      ...(tool.web_search?.allowed_domains?.length || tool.web_search?.excluded_domains?.length
        ? {
            filters: {
              allowed_domains: tool.web_search?.allowed_domains,
              excluded_domains: tool.web_search?.excluded_domains,
            },
          }
        : {}),
      ...(tool.web_search?.enable_image_understanding !== undefined
        ? { enable_image_understanding: tool.web_search.enable_image_understanding }
        : {}),
    }
  }

  if (tool.type === "x_search") {
    return {
      type: "x_search",
      ...(tool.x_search?.from_date ? { from_date: tool.x_search.from_date } : {}),
      ...(tool.x_search?.to_date ? { to_date: tool.x_search.to_date } : {}),
      ...(tool.x_search?.allowed_x_handles?.length
        ? { allowed_x_handles: tool.x_search.allowed_x_handles }
        : {}),
      ...(tool.x_search?.excluded_x_handles?.length
        ? { excluded_x_handles: tool.x_search.excluded_x_handles }
        : {}),
      ...(tool.x_search?.enable_image_understanding !== undefined
        ? { enable_image_understanding: tool.x_search.enable_image_understanding }
        : {}),
      ...(tool.x_search?.enable_video_understanding !== undefined
        ? { enable_video_understanding: tool.x_search.enable_video_understanding }
        : {}),
    }
  }

  return tool
}

function toResponsesFunctionTools(toolSet: ToolSet) {
  return Object.entries(toolSet).flatMap(([name, tool]) => {
    if (!tool) return []
    return [
      {
        type: "function" as const,
        name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    ]
  })
}
