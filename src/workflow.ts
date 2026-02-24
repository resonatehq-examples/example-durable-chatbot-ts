import type { Context } from "@resonatehq/sdk";
import { callClaude } from "./llm.js";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ---------------------------------------------------------------------------
// Durable Chat Turn Workflow
// ---------------------------------------------------------------------------
// Each conversation turn is a durable workflow step. The LLM call inside
// ctx.run() is checkpointed: if it succeeds, the result is cached and won't
// be called again on replay. If it fails, Resonate retries automatically.
//
// The conversation history is passed in as input — on any retry or replay,
// the history is already known. The user never has to re-send their message.
//
// Each turn gets a stable promise ID: "session-{id}/turn-{n}". Running the
// same ID twice returns the cached result, making every turn idempotent.

export function* processTurn(
  ctx: Context,
  history: ChatMessage[],
  turnKey: string,
  isCrashTurn: boolean,
): Generator<any, string, any> {
  // This is the only line that matters for durability.
  // ctx.run creates a durable promise for this LLM call.
  // Success: result cached, won't call LLM again on replay.
  // Failure: Resonate retries with exponential backoff — automatically.
  const response = yield* ctx.run(callClaude, history, turnKey, isCrashTurn);
  return response;
}
