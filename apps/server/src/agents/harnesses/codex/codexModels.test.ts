import { expect, test } from "bun:test";
import { CODEX_MODELS_REQUESTS, parseCodexModelsLine } from "./codexModels.ts";

test("the requests initialize the app server and then ask for the model list", () => {
	expect(
		CODEX_MODELS_REQUESTS.trimEnd()
			.split("\n")
			.map((text) => JSON.parse(text)),
	).toEqual([
		{
			id: 1,
			method: "initialize",
			params: { clientInfo: { name: "trellis_host", version: "1" }, capabilities: { experimentalApi: true } },
		},
		{ method: "initialized" },
		{ id: 2, method: "model/list", params: {} },
	]);
});

test("the model list answer becomes flag values with labels, without hidden models", () => {
	const data = [
		{ id: "gpt-6-astra", model: "gpt-6-astra", displayName: "GPT-6-Astra", hidden: false, isDefault: true },
		{ id: "gpt-5.6-sol", model: "gpt-5.6-sol", displayName: "GPT-5.6-Sol", hidden: false },
		{ id: "gpt-5.3-lab", model: "gpt-5.3-lab", displayName: "GPT-5.3-Lab", hidden: true },
	];
	expect(parseCodexModelsLine(JSON.stringify({ id: 2, result: { data, nextCursor: null } }))).toEqual([
		{ name: "gpt-6-astra", label: "GPT-6-Astra" },
		{ name: "gpt-5.6-sol", label: "GPT-5.6-Sol" },
	]);
});

test("every other message is skipped", () => {
	expect(parseCodexModelsLine(JSON.stringify({ id: 1, result: { userAgent: "codex" } }))).toBeNull();
	expect(parseCodexModelsLine(JSON.stringify({ method: "remoteControl/status/changed", params: {} }))).toBeNull();
	expect(parseCodexModelsLine("warning: something")).toBeNull();
});

test("a failed model list names the error", () => {
	expect(() => parseCodexModelsLine(JSON.stringify({ id: 2, error: { code: -32000, message: "no auth" } }))).toThrow(
		'codex did not list its models: {"code":-32000,"message":"no auth"}',
	);
});
