// xAI Chat API TypeScript types
// Reconstructed from xai-sdk-python/src/xai_sdk/proto/v6/chat_pb2.pyi

// ─── Enums ──────────────────────────────────────────────────────────────────

export enum IncludeOption {
  INVALID = 0,
  WEB_SEARCH_CALL_OUTPUT = 1,
  X_SEARCH_CALL_OUTPUT = 2,
  CODE_EXECUTION_CALL_OUTPUT = 3,
  COLLECTIONS_SEARCH_CALL_OUTPUT = 4,
  ATTACHMENT_SEARCH_CALL_OUTPUT = 5,
  MCP_CALL_OUTPUT = 6,
  INLINE_CITATIONS = 7,
  VERBOSE_STREAMING = 8,
}

export const IncludeOptionString = {
  [IncludeOption.WEB_SEARCH_CALL_OUTPUT]: "web_search_call.output",
  [IncludeOption.X_SEARCH_CALL_OUTPUT]: "x_search_call.output",
  [IncludeOption.CODE_EXECUTION_CALL_OUTPUT]: "code_execution_call.output",
  [IncludeOption.COLLECTIONS_SEARCH_CALL_OUTPUT]: "collections_search_call.output",
  [IncludeOption.ATTACHMENT_SEARCH_CALL_OUTPUT]: "attachment_search_call.output",
  [IncludeOption.MCP_CALL_OUTPUT]: "mcp_call.output",
  [IncludeOption.INLINE_CITATIONS]: "inline_citations",
  [IncludeOption.VERBOSE_STREAMING]: "verbose_streaming",
} as const

export type MessageRole = "system" | "user" | "assistant" | "tool" | "developer"

export type ReasoningEffort = "low" | "medium" | "high"

export type AgentCount = 4 | 16

export type ToolMode = "auto" | "none" | "required"

export type FormatType = "text" | "json_object" | "json_schema"

export type ToolCallType =
  | "client_side_tool"
  | "web_search_tool"
  | "x_search_tool"
  | "code_execution_tool"
  | "collections_search_tool"
  | "mcp_tool"
  | "attachment_search_tool"

export type ToolCallStatus = "in_progress" | "completed" | "incomplete" | "failed"

export type SearchMode = "off" | "on" | "auto"

export type FinishReason = "stop" | "length" | "tool_calls" | "content_filter" | "max_context"

export type DeferredStatus = "done" | "expired" | "pending"

// ─── Request Types ──────────────────────────────────────────────────────────

export interface Content {
  type: "text" | "image_url" | "file"
  text?: string
  image_url?: { url: string; detail?: "auto" | "low" | "high" }
  file?: { file_id: string }
}

export interface FunctionCall {
  name: string
  arguments: string
}

export interface ToolCall {
  id: string
  type?: ToolCallType
  status?: ToolCallStatus
  error_message?: string
  function: FunctionCall
}

export interface Message {
  role: MessageRole
  content: string | Content[]
  name?: string
  tool_call_id?: string
  tool_calls?: ToolCall[]
  reasoning_content?: string
}

export interface FunctionDef {
  name: string
  description?: string
  strict?: boolean
  parameters?: string | Record<string, any>
}

export interface WebSearch {
  excluded_domains?: string[]
  allowed_domains?: string[]
  enable_image_understanding?: boolean
  user_location?: {
    country?: string
    city?: string
    region?: string
    timezone?: string
  }
}

export interface XSearch {
  from_date?: string
  to_date?: string
  allowed_x_handles?: string[]
  excluded_x_handles?: string[]
  enable_image_understanding?: boolean
  enable_video_understanding?: boolean
}

export interface CodeExecution {}

export interface CollectionsSearch {
  collection_ids?: string[]
  limit?: number
  instructions?: string
}

export interface MCPTool {
  server_label: string
  server_description?: string
  server_url: string
  allowed_tool_names?: string[]
  authorization?: string
  extra_headers?: Record<string, string>
}

export interface AttachmentSearch {
  limit?: number
}

export interface Tool {
  type: "function" | "web_search" | "x_search" | "code_execution" | "collections_search" | "mcp" | "attachment_search"
  function?: FunctionDef
  web_search?: WebSearch
  x_search?: XSearch
  code_execution?: CodeExecution
  collections_search?: CollectionsSearch
  mcp?: MCPTool
  attachment_search?: AttachmentSearch
}

export interface ToolChoice {
  type: ToolMode
  function?: { name: string }
}

export interface ResponseFormat {
  type: FormatType
  json_schema?: {
    name: string
    schema: Record<string, any>
    strict?: boolean
  }
}

export interface SearchSource {
  web?: {
    excluded_websites?: string[]
    allowed_websites?: string[]
    country?: string
    safe_search?: boolean
  }
  news?: {
    excluded_websites?: string[]
    country?: string
    safe_search?: boolean
  }
  x?: {
    included_x_handles?: string[]
    excluded_x_handles?: string[]
    post_favorite_count?: number
    post_view_count?: number
  }
  rss?: {
    links?: string[]
  }
}

export interface SearchParameters {
  mode?: SearchMode
  sources?: SearchSource[]
  from_date?: string
  to_date?: string
  return_citations?: boolean
  max_search_results?: number
}

export interface ChatCompletionRequest {
  model: string
  messages: Message[]
  max_tokens?: number
  temperature?: number
  top_p?: number
  n?: number
  seed?: number
  stop?: string[]
  stream?: boolean
  tools?: Tool[]
  tool_choice?: ToolChoice | string
  response_format?: ResponseFormat
  frequency_penalty?: number
  presence_penalty?: number
  reasoning_effort?: ReasoningEffort
  search_parameters?: SearchParameters
  parallel_tool_calls?: boolean
  previous_response_id?: string
  store_messages?: boolean
  use_encrypted_content?: boolean
  max_turns?: number
  include?: string[]
  agent_count?: AgentCount
  logprobs?: boolean
  top_logprobs?: number
  user?: string
}

// ─── Response Types ─────────────────────────────────────────────────────────

export interface InlineCitation {
  id: string
  start_index: number
  end_index: number
  web_citation?: { url: string }
  x_citation?: { url: string }
  collections_citation?: {
    file_id: string
    chunk_id: string
    chunk_content: string
    score: number
    collection_ids: string[]
  }
}

export interface CompletionMessage {
  role: MessageRole
  content: string | null
  reasoning_content?: string | null
  tool_calls?: ToolCall[]
  encrypted_content?: string
  citations?: InlineCitation[]
}

export interface SamplingUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  reasoning_tokens?: number
  cached_prompt_text_tokens?: number
  server_side_tools_used?: string[]
}

export interface CompletionOutput {
  index: number
  message: CompletionMessage
  finish_reason: FinishReason | null
  logprobs?: any
}

export interface ChatCompletionResponse {
  id: string
  object: "chat.completion"
  created: number
  model: string
  system_fingerprint?: string
  choices: CompletionOutput[]
  usage: SamplingUsage
  citations?: string[]
}

// ─── Streaming Types ────────────────────────────────────────────────────────

export interface Delta {
  role?: MessageRole
  content?: string | null
  reasoning_content?: string | null
  tool_calls?: Array<{
    index: number
    id?: string
    type?: ToolCallType
    status?: ToolCallStatus
    error_message?: string
    function?: {
      name?: string
      arguments?: string
    }
  }>
  encrypted_content?: string
  citations?: InlineCitation[]
}

export interface ChunkChoice {
  index: number
  delta: Delta
  finish_reason: FinishReason | null
  logprobs?: any
}

export interface ChatCompletionChunk {
  id: string
  object: "chat.completion.chunk"
  created: number
  model: string
  system_fingerprint?: string
  choices: ChunkChoice[]
  usage?: SamplingUsage
  citations?: string[]
}

// ─── Deferred Types ─────────────────────────────────────────────────────────

export interface StartDeferredResponse {
  request_id: string
}

export interface GetDeferredResponse {
  status: DeferredStatus
  response?: ChatCompletionResponse
}

// ─── Stored Responses ───────────────────────────────────────────────────────

export interface GetStoredCompletionRequest {
  response_id: string
}

export interface DeleteStoredCompletionResponse {
  response_id: string
}
