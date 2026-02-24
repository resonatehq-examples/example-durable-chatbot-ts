import Anthropic from "@anthropic-ai/sdk";
import type { Context } from "@resonatehq/sdk";
import type { ChatMessage } from "./workflow.js";

const client = new Anthropic();

// Track LLM call attempts per turn (module-level, persists across Resonate
// retries within the same process — same pattern as food-delivery crash demo)
const callAttempts: Record<string, number> = {};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// callClaude is a plain async function — it becomes a durable step when
// wrapped in ctx.run(). On failure, Resonate retries automatically.
// On success, the result is cached: same promise ID → same result, no second API call.
export async function callClaude(
  _ctx: Context,
  history: ChatMessage[],
  turnKey: string,
  isCrashTurn: boolean,
): Promise<string> {
  callAttempts[turnKey] = (callAttempts[turnKey] ?? 0) + 1;
  const attempt = callAttempts[turnKey]!;

  console.log(`[llm]   Calling Claude (attempt ${attempt})...`);

  // In crash demo, first attempt of the designated crash turn always fails
  if (isCrashTurn && attempt === 1) {
    await sleep(300);
    throw new Error("LLM API connection timeout (simulated)");
  }

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system: "You are a helpful assistant. Be concise — respond in 1-3 sentences.",
    messages: history.map((m) => ({ role: m.role, content: m.content })),
  });

  const content = response.content[0];
  if (!content || content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  return content.text;
}
