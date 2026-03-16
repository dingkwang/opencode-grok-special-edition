// Converts opencode config serverTools into xAI Tool[] objects
import type { Config } from "@/config/config"
import type { Tool as XaiTool } from "./types"

type ServerToolsConfig = NonNullable<Config.Info["serverTools"]>
type AgentServerTools = {
  webSearch?: boolean
  xSearch?: boolean
  codeExecution?: boolean
  collectionsSearch?: boolean
  mcp?: boolean
  attachmentSearch?: boolean
}

export function configToServerTools(
  config: ServerToolsConfig,
  agentOverrides?: AgentServerTools,
): XaiTool[] {
  const tools: XaiTool[] = []

  // Web Search
  const webSearch = config.webSearch
  if (webSearch?.enabled && agentOverrides?.webSearch !== false) {
    tools.push({
      type: "web_search",
      web_search: {
        allowed_domains: webSearch.allowedDomains,
        excluded_domains: webSearch.excludedDomains,
        enable_image_understanding: webSearch.enableImageUnderstanding,
        user_location: webSearch.userLocation
          ? {
              country: webSearch.userLocation.country,
              city: webSearch.userLocation.city,
              region: webSearch.userLocation.region,
              timezone: webSearch.userLocation.timezone,
            }
          : undefined,
      },
    })
  }

  // X Search
  const xSearch = config.xSearch
  if (xSearch?.enabled && agentOverrides?.xSearch !== false) {
    tools.push({
      type: "x_search",
      x_search: {
        from_date: xSearch.fromDate,
        to_date: xSearch.toDate,
        allowed_x_handles: xSearch.allowedHandles,
        excluded_x_handles: xSearch.excludedHandles,
        enable_image_understanding: xSearch.enableImageUnderstanding,
        enable_video_understanding: xSearch.enableVideoUnderstanding,
      },
    })
  }

  // Code Execution
  const codeExecution = config.codeExecution
  if (codeExecution?.enabled && agentOverrides?.codeExecution !== false) {
    tools.push({
      type: "code_execution",
      code_execution: {},
    })
  }

  // Collections Search
  const collectionsSearch = config.collectionsSearch
  if (collectionsSearch?.enabled && agentOverrides?.collectionsSearch !== false) {
    tools.push({
      type: "collections_search",
      collections_search: {
        collection_ids: collectionsSearch.collectionIds,
        limit: collectionsSearch.limit,
        instructions: collectionsSearch.instructions,
      },
    })
  }

  // Server-side MCP
  const mcp = config.mcp
  if (mcp?.enabled && agentOverrides?.mcp !== false && mcp.servers?.length) {
    for (const server of mcp.servers) {
      tools.push({
        type: "mcp",
        mcp: {
          server_url: server.serverUrl,
          server_label: server.serverLabel,
          server_description: server.serverDescription,
          allowed_tool_names: server.allowedToolNames,
          authorization: server.authorization,
          extra_headers: server.extraHeaders,
        },
      })
    }
  }

  // Attachment Search
  const attachmentSearch = config.attachmentSearch
  if (attachmentSearch?.enabled && agentOverrides?.attachmentSearch !== false) {
    tools.push({
      type: "attachment_search",
      attachment_search: {
        limit: attachmentSearch.limit,
      },
    })
  }

  return tools
}

export function configToSearchParameters(
  config: NonNullable<Config.Info["searchParameters"]>,
) {
  return {
    mode: config.mode,
    from_date: config.fromDate,
    to_date: config.toDate,
    return_citations: config.returnCitations,
    max_search_results: config.maxSearchResults,
  }
}

export function configToInclude(config: ServerToolsConfig): string[] {
  const include: string[] = []

  const hasServerTool =
    config.webSearch?.enabled ||
    config.xSearch?.enabled ||
    config.codeExecution?.enabled ||
    config.collectionsSearch?.enabled ||
    config.attachmentSearch?.enabled ||
    config.mcp?.enabled

  // xAI's current chat/tool docs use high-level include flags rather than
  // per-tool "*.output" selectors. The older selectors cause 422 validation
  // errors on tool-enabled requests.
  if (hasServerTool) include.push("verbose_streaming")

  // Always include inline citations when any search tool is enabled
  if (config.webSearch?.enabled || config.xSearch?.enabled) include.push("inline_citations")

  return include
}
