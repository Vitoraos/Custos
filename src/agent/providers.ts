// src/agent/providers.ts — free LLM provider pool with fallback (spec §6.1 v2)
import { Agent } from '@strands-agents/sdk';
import { OpenAIModel } from '@strands-agents/sdk/models/openai';

type Provider = { name: string; baseURL: string; apiKey?: string; modelId: string };

// Order = preference. Every endpoint is OpenAI-compatible, so one class covers all.
const PROVIDERS: Provider[] = [
  {
    name: 'groq',
    baseURL: 'https://api.groq.com/openai/v1',
    apiKey: process.env.GROQ_API_KEY,
    modelId: process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b',
  },
  {
    name: 'workers-ai',
    baseURL: `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`,
    apiKey: process.env.CLOUDFLARE_API_TOKEN,
    modelId: process.env.CF_MODEL ?? '@cf/openai/gpt-oss-120b', // check `wrangler ai models list`
  },
  {
    name: 'gemini',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    apiKey: process.env.GEMINI_API_KEY,
    modelId: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash', // check AI Studio for current free models
  },
  {
    name: 'openrouter',
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
    modelId: process.env.OPENROUTER_MODEL ?? 'openrouter/free',
  },
].filter((p) => p.apiKey);

export const usage: Record<string, number> = {}; // log this to see which quota you are burning

function makeAgent(systemPrompt: string, p: Provider) {
  const model = new OpenAIModel({
    api: 'chat',
    apiKey: p.apiKey,
    clientConfig: { baseURL: p.baseURL },
    modelId: p.modelId,
  });
  return new Agent({ model, systemPrompt });
}

// One prompt, with provider fallback on any error (429, 5xx, bad key, deprecated model).
export async function runWithFallback(systemPrompt: string, prompt: string) {
  const errors: string[] = [];
  for (const p of PROVIDERS) {
    try {
      const result = await makeAgent(systemPrompt, p).invoke(prompt);
      usage[p.name] = (usage[p.name] ?? 0) + 1;
      // Confirmed on @strands-agents/sdk 1.19.0: AgentResult.toString() returns
      // interrupts/structuredOutput JSON, else textBlock content joined by newlines.
      return { text: result.toString(), provider: p.name, fallbacks: errors };
    } catch (e) {
      errors.push(`${p.name}: ${(e as Error).message}`);
    }
  }
  throw new Error('All LLM providers failed: ' + errors.join(' | '));
}
