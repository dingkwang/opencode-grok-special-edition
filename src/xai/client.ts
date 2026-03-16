import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ResponsesRequest,
  ResponsesResponse,
  StartDeferredResponse,
  GetDeferredResponse,
  DeleteStoredCompletionResponse,
} from "./types"
import { APICallError } from "@/ai-stub"
import { Log } from "@/util/log"

const log = Log.create({ service: "xai-client" })

export interface XaiClientConfig {
  apiKey: string
  baseUrl?: string
  timeout?: number
}

export class XaiClient {
  private apiKey: string
  private baseUrl: string
  private timeout: number

  constructor(config: XaiClientConfig) {
    this.apiKey = config.apiKey
    this.baseUrl = (config.baseUrl ?? "https://api.x.ai/v1").replace(/\/$/, "")
    this.timeout = config.timeout ?? 300_000
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    }
  }

  async chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const body = { ...request, stream: false }
    const url = `${this.baseUrl}/chat/completions`

    const response = await fetch(url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout),
    })

    if (!response.ok) {
      const responseBody = await response.text().catch(() => "")
      throw new APICallError({
        message: `xAI API error: ${response.status} ${response.statusText}`,
        statusCode: response.status,
        responseBody,
        isRetryable: response.status >= 500 || response.status === 429,
        url,
      })
    }

    return response.json()
  }

  async *chatStream(
    request: ChatCompletionRequest,
    abortSignal?: AbortSignal,
  ): AsyncGenerator<ChatCompletionChunk> {
    const body = { ...request, stream: true, stream_options: { include_usage: true } }
    const url = `${this.baseUrl}/chat/completions`

    const signals: AbortSignal[] = [AbortSignal.timeout(this.timeout)]
    if (abortSignal) signals.push(abortSignal)
    const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0]

    const response = await fetch(url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal,
    })

    if (!response.ok) {
      const responseBody = await response.text().catch(() => "")
      throw new APICallError({
        message: `xAI API error: ${response.status} ${response.statusText}`,
        statusCode: response.status,
        responseBody,
        isRetryable: response.status >= 500 || response.status === 429,
        url,
      })
    }

    if (!response.body) {
      throw new APICallError({
        message: "No response body for streaming request",
        url,
      })
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith("data: ")) continue
          const data = trimmed.slice(6)
          if (data === "[DONE]") return

          try {
            const chunk: ChatCompletionChunk = JSON.parse(data)
            yield chunk
          } catch (e) {
            log.error("Failed to parse SSE chunk", { data, error: e })
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        const trimmed = buffer.trim()
        if (trimmed.startsWith("data: ") && trimmed.slice(6) !== "[DONE]") {
          try {
            yield JSON.parse(trimmed.slice(6))
          } catch {}
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  async startDeferred(request: ChatCompletionRequest): Promise<StartDeferredResponse> {
    const url = `${this.baseUrl}/chat/completions`
    const body = { ...request, stream: false, deferred: true }

    const response = await fetch(url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout),
    })

    if (!response.ok) {
      const responseBody = await response.text().catch(() => "")
      throw new APICallError({
        message: `xAI deferred API error: ${response.status}`,
        statusCode: response.status,
        responseBody,
        isRetryable: response.status >= 500,
        url,
      })
    }

    return response.json()
  }

  async getDeferred(requestId: string): Promise<GetDeferredResponse> {
    const url = `${this.baseUrl}/chat/completions/deferred/${requestId}`

    const response = await fetch(url, {
      method: "GET",
      headers: this.headers(),
      signal: AbortSignal.timeout(this.timeout),
    })

    if (!response.ok) {
      const responseBody = await response.text().catch(() => "")
      throw new APICallError({
        message: `xAI deferred poll error: ${response.status}`,
        statusCode: response.status,
        responseBody,
        isRetryable: response.status >= 500,
        url,
      })
    }

    return response.json()
  }

  async getStored(responseId: string): Promise<ChatCompletionResponse> {
    const url = `${this.baseUrl}/chat/completions/stored/${responseId}`

    const response = await fetch(url, {
      method: "GET",
      headers: this.headers(),
      signal: AbortSignal.timeout(this.timeout),
    })

    if (!response.ok) {
      const responseBody = await response.text().catch(() => "")
      throw new APICallError({
        message: `xAI stored response error: ${response.status}`,
        statusCode: response.status,
        responseBody,
        url,
      })
    }

    return response.json()
  }

  async deleteStored(responseId: string): Promise<DeleteStoredCompletionResponse> {
    const url = `${this.baseUrl}/chat/completions/stored/${responseId}`

    const response = await fetch(url, {
      method: "DELETE",
      headers: this.headers(),
      signal: AbortSignal.timeout(this.timeout),
    })

    if (!response.ok) {
      const responseBody = await response.text().catch(() => "")
      throw new APICallError({
        message: `xAI delete stored response error: ${response.status}`,
        statusCode: response.status,
        responseBody,
        url,
      })
    }

    return response.json()
  }

  async responses(request: ResponsesRequest): Promise<ResponsesResponse> {
    const url = `${this.baseUrl}/responses`

    const response = await fetch(url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(this.timeout),
    })

    if (!response.ok) {
      const responseBody = await response.text().catch(() => "")
      throw new APICallError({
        message: `xAI API error: ${response.status} ${response.statusText}`,
        statusCode: response.status,
        responseBody,
        isRetryable: response.status >= 500 || response.status === 429,
        url,
      })
    }

    return response.json()
  }
}

// Factory function to create client from environment
export function createXaiClient(options?: Partial<XaiClientConfig>): XaiClient {
  const apiKey = options?.apiKey ?? process.env.XAI_API_KEY
  if (!apiKey) {
    throw new Error("XAI_API_KEY environment variable is required")
  }
  return new XaiClient({
    apiKey,
    baseUrl: options?.baseUrl ?? process.env.GROK_ENDPOINT,
    timeout: options?.timeout,
  })
}
