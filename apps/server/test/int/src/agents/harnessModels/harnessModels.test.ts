import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listHarnessModels } from "../../../../../src/agents/harnessModels";
import { writeHarnessModelsBin } from "../../../../helpers/harnessModelsBin.ts";

// Each harness fixture answers the model query the way the real program
// does, so this covers the spawn, the streams, and the parse together.

let home: string;
let env: Record<string, string | undefined>;
beforeAll(() => {
	home = mkdtempSync(join(tmpdir(), "trl-models-"));
	env = { ...process.env, PATH: `${writeHarnessModelsBin(join(home, "bin"))}:${process.env.PATH}` };
});
afterAll(() => rmSync(home, { recursive: true, force: true }));

test("claude answers the initialize control request with its model picker", async () => {
	expect(await listHarnessModels("claude", env)).toEqual([
		{ value: "opus[1m]", label: "Opus (1M context)" },
		{ value: "sonnet", label: "Sonnet" },
	]);
});

test("codex answers model/list over stdio and exits when stdin closes", async () => {
	expect(await listHarnessModels("codex", env)).toEqual([
		{ value: "gpt-6-astra", label: "GPT-6-Astra" },
		{ value: "gpt-5.6-sol", label: "GPT-5.6-Sol" },
	]);
});

test("opencode lists provider/model lines", async () => {
	expect(await listHarnessModels("opencode", env)).toEqual([
		{ value: "opencode/big-pickle", label: "opencode/big-pickle" },
		{ value: "openai/gpt-5.5", label: "openai/gpt-5.5" },
		{ value: "anthropic/claude-sonnet-5", label: "anthropic/claude-sonnet-5" },
	]);
});

test("pi lists its table from stderr", async () => {
	expect(await listHarnessModels("pi", env)).toEqual([
		{ value: "anthropic/claude-sonnet-5", label: "anthropic/claude-sonnet-5" },
		{ value: "vercel-ai-gateway/anthropic/claude-fable-5", label: "vercel-ai-gateway/anthropic/claude-fable-5" },
	]);
});

test("a harness that is not on PATH fails with its name", async () => {
	await expect(listHarnessModels("pi", { PATH: join(home, "empty") })).rejects.toThrow(
		"Harness executable pi was not found on PATH",
	);
});
