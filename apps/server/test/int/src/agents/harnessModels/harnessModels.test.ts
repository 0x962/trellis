import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listHarnessModels } from "../../../../../src/agents/harnessModels";
import { writeHarnessModelsBin } from "../../../../helpers/harnessModelsBin.ts";

// Each harness fixture answers the model query the way the real program
// does, so this covers the spawn, the streams, the parse, and the step that
// turns each listed name into a canonical trellis model id together. A name
// that `catalog.json` does not hold leaves the list.

let home: string;
let cwd: string;
let spawn: { cwd: string; env: Record<string, string | undefined> };
beforeAll(() => {
	home = mkdtempSync(join(tmpdir(), "trl-models-"));
	cwd = join(home, "data");
	mkdirSync(cwd);
	spawn = { cwd, env: { ...process.env, PATH: `${writeHarnessModelsBin(join(home, "bin"))}:${process.env.PATH}` } };
});
afterAll(() => rmSync(home, { recursive: true, force: true }));

test("claude answers the initialize control request with its model picker, from the given cwd", async () => {
	// The catalog holds no 1M-context Opus, so only Sonnet survives.
	expect(await listHarnessModels("claude", spawn)).toEqual([{ value: "anthropic/claude-sonnet-5", label: "Sonnet" }]);
	expect(existsSync(join(cwd, "claude-models-cwd"))).toBe(true);
});

test("codex answers model/list over stdio and exits when stdin closes", async () => {
	expect(await listHarnessModels("codex", spawn)).toEqual([
		{ value: "openai/gpt-6-astra", label: "GPT-6-Astra" },
		{ value: "openai/gpt-5.6-sol", label: "GPT-5.6-Sol" },
	]);
});

test("opencode lists provider/model lines", async () => {
	// `opencode/big-pickle` is in no catalog row, so it leaves the list.
	expect(await listHarnessModels("opencode", spawn)).toEqual([
		{ value: "openai/gpt-5.5", label: "openai/gpt-5.5" },
		{ value: "anthropic/claude-sonnet-5", label: "anthropic/claude-sonnet-5" },
	]);
});

test("pi lists its table from stderr", async () => {
	expect(await listHarnessModels("pi", spawn)).toEqual([
		{ value: "anthropic/claude-sonnet-5", label: "anthropic/claude-sonnet-5" },
		{ value: "anthropic/claude-fable-5", label: "vercel-ai-gateway/anthropic/claude-fable-5" },
	]);
});

test("muse answers model/list on its session host", async () => {
	// trellis launches muse on a Muse Spark model only, so Glimmer leaves
	// the list even though the catalog holds it.
	expect(await listHarnessModels("muse", spawn)).toEqual([{ value: "meta/muse-spark-1.3", label: "Muse Spark 1.3" }]);
});

test("a harness that is not on PATH fails with its name", async () => {
	await expect(listHarnessModels("pi", { cwd, env: { PATH: join(home, "empty") } })).rejects.toThrow(
		"Harness executable pi was not found on PATH",
	);
});
