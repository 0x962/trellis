#!/usr/bin/env bun
import { appendFileSync } from "node:fs";

// This script stands in for the gh binary in tests. TRELLIS_GH_BIN points the
// runner at it. It answers from TRELLIS_GH_STUB_FILE, a JSON map keyed by the
// first two arguments ("api graphql", "pr diff"). Every spawn appends one JSON
// line to TRELLIS_GH_STUB_LOG before any delay, so a test reads which calls
// started while a slow call still runs.

type Reply = { stdout: string; stderr: string; exitCode: number; delayMs?: number };

const args = process.argv.slice(2);
const key = `${args[0]} ${args[1]}`;
const { GH_PROMPT_DISABLED, NO_COLOR, PATH } = process.env;
appendFileSync(
	process.env.TRELLIS_GH_STUB_LOG!,
	`${JSON.stringify({ args, env: { GH_PROMPT_DISABLED, NO_COLOR, PATH }, at: Date.now(), pid: process.pid })}\n`,
);

const replies = (await Bun.file(process.env.TRELLIS_GH_STUB_FILE!).json()) as Record<string, Reply>;
const reply = replies[key];
if (reply === undefined) {
	await Bun.write(Bun.stderr, `no stub reply for ${key}`);
	process.exit(1);
}
if (reply.delayMs !== undefined) await Bun.sleep(reply.delayMs);
await Bun.write(Bun.stdout, reply.stdout);
await Bun.write(Bun.stderr, reply.stderr);
process.exit(reply.exitCode);
