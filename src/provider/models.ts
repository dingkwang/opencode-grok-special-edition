import { Log } from "../util/log"
import z from "zod"
import { lazy } from "@/util/lazy"

export namespace ModelsDev {
  const log = Log.create({ service: "models" })

  export const Model = z.object({
    id: z.string(),
    name: z.string(),
    family: z.string().optional(),
    release_date: z.string(),
    attachment: z.boolean(),
    reasoning: z.boolean(),
    temperature: z.boolean(),
    tool_call: z.boolean(),
    interleaved: z
      .union([
        z.literal(true),
        z
          .object({
            field: z.enum(["reasoning_content", "reasoning_details"]),
          })
          .strict(),
      ])
      .optional(),
    cost: z
      .object({
        input: z.number(),
        output: z.number(),
        cache_read: z.number().optional(),
        cache_write: z.number().optional(),
        context_over_200k: z
          .object({
            input: z.number(),
            output: z.number(),
            cache_read: z.number().optional(),
            cache_write: z.number().optional(),
          })
          .optional(),
      })
      .optional(),
    limit: z.object({
      context: z.number(),
      input: z.number().optional(),
      output: z.number(),
    }),
    modalities: z
      .object({
        input: z.array(z.enum(["text", "audio", "image", "video", "pdf"])),
        output: z.array(z.enum(["text", "audio", "image", "video", "pdf"])),
      })
      .optional(),
    experimental: z.boolean().optional(),
    status: z.enum(["alpha", "beta", "deprecated"]).optional(),
    options: z.record(z.string(), z.any()),
    headers: z.record(z.string(), z.string()).optional(),
    provider: z.object({ npm: z.string().optional(), api: z.string().optional() }).optional(),
    variants: z.record(z.string(), z.record(z.string(), z.any())).optional(),
  })
  export type Model = z.infer<typeof Model>

  export const Provider = z.object({
    api: z.string().optional(),
    name: z.string(),
    env: z.array(z.string()),
    id: z.string(),
    npm: z.string().optional(),
    models: z.record(z.string(), Model),
  })

  export type Provider = z.infer<typeof Provider>

  // Static Grok model registry
  const GROK_MODELS: Record<string, Model> = {
    "grok-3": {
      id: "grok-3",
      name: "Grok 3",
      family: "grok-3",
      release_date: "2025-02-01",
      attachment: true,
      reasoning: false,
      temperature: true,
      tool_call: true,
      cost: { input: 3, output: 15 },
      limit: { context: 131072, output: 32768 },
      modalities: {
        input: ["text", "image"],
        output: ["text"],
      },
      options: {},
    },
    "grok-3-mini": {
      id: "grok-3-mini",
      name: "Grok 3 Mini",
      family: "grok-3",
      release_date: "2025-02-01",
      attachment: true,
      reasoning: true,
      temperature: true,
      tool_call: true,
      cost: { input: 0.3, output: 0.5 },
      limit: { context: 131072, output: 32768 },
      modalities: {
        input: ["text", "image"],
        output: ["text"],
      },
      options: {},
    },
    "grok-4": {
      id: "grok-4",
      name: "Grok 4",
      family: "grok-4",
      release_date: "2025-07-01",
      attachment: true,
      reasoning: true,
      temperature: true,
      tool_call: true,
      cost: { input: 6, output: 18 },
      limit: { context: 256000, output: 32768 },
      modalities: {
        input: ["text", "image", "pdf"],
        output: ["text"],
      },
      options: {},
    },
    "grok-4-fast": {
      id: "grok-4-fast",
      name: "Grok 4 Fast",
      family: "grok-4",
      release_date: "2025-07-01",
      attachment: true,
      reasoning: false,
      temperature: true,
      tool_call: true,
      cost: { input: 3, output: 9 },
      limit: { context: 256000, output: 32768 },
      modalities: {
        input: ["text", "image", "pdf"],
        output: ["text"],
      },
      options: {},
    },
    "grok-code-fast-1": {
      id: "grok-code-fast-1",
      name: "Grok Code Fast 1",
      family: "grok-code",
      release_date: "2025-06-01",
      attachment: true,
      reasoning: false,
      temperature: true,
      tool_call: true,
      cost: { input: 1.5, output: 5 },
      limit: { context: 131072, output: 32768 },
      modalities: {
        input: ["text", "image"],
        output: ["text"],
      },
      options: {},
    },
  }

  const GROK_PROVIDER: Provider = {
    id: "xai",
    name: "xAI",
    api: "https://api.x.ai/v1",
    npm: "xai-native",
    env: ["XAI_API_KEY"],
    models: GROK_MODELS,
  }

  export const Data = lazy(async () => {
    return { xai: GROK_PROVIDER } as Record<string, unknown>
  })

  export async function get() {
    const result = await Data()
    return result as Record<string, Provider>
  }

  export async function refresh() {
    // Static registry, no refresh needed
  }
}
