// Stream events emitted by XaiStream - superset of what processor.ts handles
import type { ToolCallType, ToolCallStatus, InlineCitation, SamplingUsage } from "./types"

export type StreamEvent =
  | { type: "text-delta"; textDelta: string }
  | { type: "reasoning-delta"; textDelta: string }
  | {
      type: "tool-call"
      toolCallId: string
      toolName: string
      args: string
      toolCallType?: ToolCallType
    }
  | {
      type: "tool-result"
      toolCallId: string
      toolName: string
      result: any
    }
  | { type: "tool-error"; toolCallId: string; error: string }
  | {
      type: "server-tool-start"
      toolCallId: string
      toolCallType: ToolCallType
      toolName: string
    }
  | {
      type: "server-tool-update"
      toolCallId: string
      toolCallType: ToolCallType
      status: ToolCallStatus
      content?: string
    }
  | {
      type: "server-tool-end"
      toolCallId: string
      toolCallType: ToolCallType
      status: ToolCallStatus
      content?: string
      errorMessage?: string
    }
  | {
      type: "citation"
      citation: InlineCitation
    }
  | {
      type: "finish-step"
      finishReason: string
      usage?: SamplingUsage
      responseId?: string
    }
  | { type: "step-start" }
  | { type: "error"; error: Error }
