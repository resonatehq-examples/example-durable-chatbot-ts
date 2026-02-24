import { Resonate } from "@resonatehq/sdk";
import * as readline from "readline";
import { processTurn } from "./workflow.js";
import type { ChatMessage } from "./workflow.js";

// ---------------------------------------------------------------------------
// Resonate setup — two lines
// ---------------------------------------------------------------------------

const resonate = new Resonate();
resonate.register(processTurn);

// ---------------------------------------------------------------------------
// Run the chatbot
// ---------------------------------------------------------------------------

const crashMode = process.argv.includes("--crash");
const sessionId = `session-${Date.now()}`;
const history: ChatMessage[] = [];

console.log("=== Resonate Durable Chatbot ===");

if (crashMode) {
  await runCrashDemo();
} else {
  await runInteractive();
}

resonate.stop();

// ---------------------------------------------------------------------------
// Interactive mode: chat in a REPL loop
// ---------------------------------------------------------------------------

async function runInteractive() {
  console.log(`Session: ${sessionId} (type "exit" to quit)\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const question = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  let turn = 0;
  while (true) {
    const userInput = (await question("You: ")).trim();
    if (!userInput) continue;
    if (userInput.toLowerCase() === "exit") break;

    history.push({ role: "user", content: userInput });
    const turnKey = `${sessionId}/turn-${turn}`;

    const response = await resonate.run(turnKey, processTurn, [...history], turnKey, false);

    history.push({ role: "assistant", content: response });
    console.log(`\nAssistant: ${response}\n`);
    turn++;
  }

  rl.close();
  console.log("\nGoodbye!");
}

// ---------------------------------------------------------------------------
// Crash demo: scripted conversation showing LLM retry without re-prompting
// ---------------------------------------------------------------------------
// Runs 3 turns. On turn 2, the LLM call fails on the first attempt (simulating
// a network timeout). Resonate retries automatically. The user never re-sends.
// The conversation continues with full history intact.
//
// Key observations:
//   1. The retry message comes from Resonate — you didn't write any retry logic
//   2. Turn 1 does NOT re-run on the turn 2 retry — checkpoints are durable
//   3. The conversation history is intact on retry — no messages lost

async function runCrashDemo() {
  console.log("Mode: CRASH DEMO (LLM will fail on turn 2, then retry automatically)\n");

  const turns: Array<{ message: string; isCrashTurn: boolean }> = [
    { message: "Hello! What is durable execution?", isCrashTurn: false },
    { message: "How does it help with AI agents?", isCrashTurn: true }, // fails first attempt
    { message: "Got it. What should I try next?", isCrashTurn: false },
  ];

  let turn = 0;
  for (const { message, isCrashTurn } of turns) {
    console.log(`You: ${message}`);
    history.push({ role: "user", content: message });

    const turnKey = `${sessionId}/turn-${turn}`;

    // When isCrashTurn=true, callClaude throws on attempt 1.
    // Resonate catches the error from ctx.run and retries callClaude automatically.
    // On attempt 2, callClaude succeeds. The user never re-sends their message.
    const response = await resonate.run(
      turnKey,
      processTurn,
      [...history],
      turnKey,
      isCrashTurn,
    );

    history.push({ role: "assistant", content: response });
    console.log(`\nAssistant: ${response}\n`);
    turn++;
  }

  console.log("=== What Happened ===");
  console.log("Turn 1: LLM called once → response cached");
  console.log("Turn 2: LLM call failed (connection timeout) → Resonate retried automatically");
  console.log("        You did not re-send your message. Turn 1 did not re-run.");
  console.log("Turn 3: LLM called once → full conversation history intact");
}
