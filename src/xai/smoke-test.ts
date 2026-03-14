#!/usr/bin/env bun
// Smoke test: send "Hello" to xAI and print streamed text deltas
import { createXaiClient } from "./client"

async function main() {
  const client = createXaiClient()

  console.log("Streaming from xAI...\n")

  for await (const chunk of client.chatStream({
    model: "grok-3-mini-fast",
    messages: [{ role: "user", content: "Hello! What's 2+2? Be concise." }],
    max_tokens: 100,
  })) {
    for (const choice of chunk.choices) {
      if (choice.delta.content) {
        process.stdout.write(choice.delta.content)
      }
      if (choice.delta.reasoning_content) {
        process.stdout.write(`[thinking: ${choice.delta.reasoning_content}]`)
      }
    }
    if (chunk.usage) {
      console.log(`\n\n--- Usage ---`)
      console.log(`Prompt tokens: ${chunk.usage.prompt_tokens}`)
      console.log(`Completion tokens: ${chunk.usage.completion_tokens}`)
      console.log(`Reasoning tokens: ${chunk.usage.reasoning_tokens ?? 0}`)
      console.log(`Cached prompt tokens: ${chunk.usage.cached_prompt_text_tokens ?? 0}`)
    }
  }

  console.log("\n\nDone!")
}

main().catch(console.error)
