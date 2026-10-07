// src/agent/providers.ts — sole LLM provider: OpenRouter (spec §6.1, simplified)
// Single OpenRouter endpoint (OpenAI-compatible) via Strands' OpenAI provider.
// Model defaults to the `openrouter/free` auto-router; pin OPENROUTER_MODEL to a
// specific `:free` model for take-to-take consistency during recording.
import { Agent } from "@strands-agents/sdk";
import { OpenAIModel } from "@strands-agents/sdk/models/openai";

const BASE_URL = "https://openrouter.ai/api/v1";

function makeAgent(systemPrompt: string) {
  const model = new OpenAIModel({
    api: "chat",
    apiKey: process.env.OPENROUTER_API_KEY,
    clientConfig: { baseURL: BASE_URL },
    modelId: process.env.OPENROUTER_MODEL ?? "openrouter/free",
  });
  return new Agent({ model, systemPrompt });
}

// Kept the historic name and { text, provider, fallbacks } shape so workflow.ts
// is untouched. Single attempt; errors (429 quota, 5xx, bad key) propagate.
export async function runWithFallback(systemPrompt: string, prompt: string) {
  const result = await makeAgent(systemPrompt).invoke(prompt);
  // Confirmed on @strands-agents/sdk 1.19.0: AgentResult.toString() returns
  // interrupts/structuredOutput JSON, else textBlock content joined by newlines.
  return {
    text: result.toString(),
    provider: "openrouter",
    fallbacks: [] as string[],
  };
}
