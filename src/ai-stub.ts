// AI SDK Stub - replaces Vercel AI SDK ("ai" and "@ai-sdk/*") with minimal stubs
// This file provides type-compatible stubs so the codebase compiles without the AI SDK.
// Real LLM calls are routed through src/xai/ instead.

import z from "zod"

// ─── Types ──────────────────────────────────────────────────────────────────

export type JSONSchema7 = Record<string, any>

export type LanguageModelV2Usage = {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  reasoningTokens?: number
  cachedInputTokens?: number
}

export type ProviderMetadata = Record<string, Record<string, any>> | undefined

export type ModelMessage = {
  role: "system" | "user" | "assistant" | "tool"
  content: string | any[]
  providerOptions?: Record<string, any>
}

export type UIMessage = {
  id: string
  role: "user" | "assistant"
  parts: any[]
}

export type ToolCallOptions = {
  abortSignal?: AbortSignal
  toolCallId?: string
  messages?: ModelMessage[]
}

export type ToolResult = {
  output?: string
  title?: string
  metadata?: Record<string, any>
  attachments?: any[]
  content?: any
  [key: string]: any
}

export type Tool<TInput = any, TOutput = ToolResult> = {
  id?: string
  description?: string
  inputSchema?: any
  execute?: (input: TInput, options: ToolCallOptions) => Promise<TOutput>
  toModelOutput?: (output: unknown) => any
  [key: string]: any
}

export type ToolSet = Record<string, Tool>

export type StreamTextResult<T extends ToolSet = ToolSet, U = unknown> = {
  fullStream: AsyncIterable<StreamEvent>
  text: Promise<string>
  usage: Promise<LanguageModelV2Usage>
  finishReason: Promise<string>
  [key: string]: any
}

export type StreamEvent = {
  type: string
  [key: string]: any
}

// ─── Functions ──────────────────────────────────────────────────────────────

export function streamText(_input: any): StreamTextResult {
  throw new Error("streamText stub: use XaiStream instead")
}

export function wrapLanguageModel(input: { model: any; middleware?: any[] }): any {
  return input.model
}

export function tool<TInput = any>(input: {
  id?: string
  description?: string
  inputSchema?: any
  execute?: (input: TInput, options: ToolCallOptions) => Promise<any>
  [key: string]: any
}): Tool<TInput> {
  return input as Tool<TInput>
}

export function dynamicTool(input: {
  description?: string
  execute?: (input: any, options: ToolCallOptions) => Promise<any>
  [key: string]: any
}): Tool {
  return input as Tool
}

export function jsonSchema(schema: any): any {
  return schema
}

export function asSchema(schema: any): any {
  return schema
}

export async function generateObject(_input: any): Promise<{ object: any }> {
  throw new Error("generateObject stub: use XaiClient instead")
}

export function streamObject(_input: any): any {
  throw new Error("streamObject stub: use XaiClient instead")
}

export function convertToModelMessages(
  messages: UIMessage[],
  options?: { tools?: any },
): ModelMessage[] {
  const result: ModelMessage[] = []
  for (const msg of messages) {
    const content: any[] = []
    for (const part of msg.parts) {
      if (part.type === "text") {
        content.push({ type: "text", text: part.text })
      } else if (part.type === "reasoning") {
        content.push({ type: "reasoning", text: part.text, providerMetadata: part.providerMetadata })
      } else if (part.type === "file") {
        content.push({ type: "file", url: part.url, mediaType: part.mediaType, filename: part.filename })
      } else if (part.type === "step-start") {
        // skip
      } else if (part.type?.startsWith("tool-")) {
        const toolName = part.type.slice(5)
        const toolCallId = part.toolCallId
        if (part.state === "output-available") {
          content.push({
            type: "tool-call",
            toolCallId,
            toolName,
            args: part.input,
            providerMetadata: part.callProviderMetadata,
          })
          const toModelOutput = options?.tools?.[toolName]?.toModelOutput
          const output = toModelOutput ? toModelOutput(part.output) : { type: "text", value: typeof part.output === "string" ? part.output : JSON.stringify(part.output) }
          result.push({
            role: "tool",
            content: [{
              type: "tool-result",
              toolCallId,
              toolName,
              result: output,
            }],
          })
        } else if (part.state === "output-error") {
          content.push({
            type: "tool-call",
            toolCallId,
            toolName,
            args: part.input,
            providerMetadata: part.callProviderMetadata,
          })
          result.push({
            role: "tool",
            content: [{
              type: "tool-result",
              toolCallId,
              toolName,
              result: { type: "text", value: part.errorText ?? "Error" },
              isError: true,
            }],
          })
        }
        continue // tool parts add their own messages
      } else {
        content.push(part)
      }
    }
    if (content.length > 0) {
      // Collect tool-calls separately: push assistant with content, then tool results follow
      const toolCalls = content.filter((p) => p.type === "tool-call")
      const nonToolCalls = content.filter((p) => p.type !== "tool-call")
      const finalContent = [...nonToolCalls, ...toolCalls]
      if (finalContent.length > 0) {
        result.push({
          role: msg.role as "user" | "assistant",
          content: finalContent,
        })
      }
    }
  }
  return result
}

// ─── Error Classes ──────────────────────────────────────────────────────────

export class APICallError extends Error {
  readonly statusCode?: number
  readonly responseBody?: string
  readonly responseHeaders?: Record<string, string>
  readonly isRetryable: boolean
  readonly url?: string

  constructor(input: {
    message: string
    statusCode?: number
    responseBody?: string
    responseHeaders?: Record<string, string>
    isRetryable?: boolean
    url?: string
    cause?: unknown
  }) {
    super(input.message, { cause: input.cause })
    this.name = "AI_APICallError"
    this.statusCode = input.statusCode
    this.responseBody = input.responseBody
    this.responseHeaders = input.responseHeaders
    this.isRetryable = input.isRetryable ?? false
    this.url = input.url
  }

  static isInstance(error: unknown): error is APICallError {
    return error instanceof Error && error.name === "AI_APICallError"
  }
}

export class LoadAPIKeyError extends Error {
  constructor(input: { message: string }) {
    super(input.message)
    this.name = "AI_LoadAPIKeyError"
  }

  static isInstance(error: unknown): error is LoadAPIKeyError {
    return error instanceof Error && error.name === "AI_LoadAPIKeyError"
  }
}

export class NoSuchModelError extends Error {
  readonly modelId: string
  readonly modelType: string

  constructor(input: { modelId: string; modelType?: string }) {
    super(`No such model: ${input.modelId}`)
    this.name = "AI_NoSuchModelError"
    this.modelId = input.modelId
    this.modelType = input.modelType ?? "languageModel"
  }
}

// Re-export Provider type (used by transform.ts import of "@ai-sdk/provider")
export type { JSONSchema7 as JSONSchema }
