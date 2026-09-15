import { expect, test } from "bun:test";
import { CLAUDE_MODELS_REQUEST, parseClaudeModels } from "./claudeModels.ts";

const models = [
	{ value: "default", resolvedModel: "claude-opus-5[1m]", displayName: "Default (recommended)" },
	{ value: "opus[1m]", resolvedModel: "claude-opus-5[1m]", displayName: "Opus (1M context)" },
	{ value: "sonnet", resolvedModel: "claude-sonnet-5", displayName: "Sonnet" },
];
const answer = (response: unknown) =>
	[
		JSON.stringify({ type: "system", subtype: "hook_started", hook_name: "SessionStart:startup" }),
		JSON.stringify({ type: "control_response", response }),
		"",
	].join("\n");

test("the initialize request carries a stable request id", () => {
	expect(JSON.parse(CLAUDE_MODELS_REQUEST)).toEqual({
		type: "control_request",
		request_id: "trellis-models",
		request: { subtype: "initialize" },
	});
});

test("the model picker of claude becomes flag values with labels, without the default entry", () => {
	const stdout = answer({ subtype: "success", request_id: "trellis-models", response: { models, commands: [] } });
	expect(parseClaudeModels(stdout)).toEqual([
		{ value: "opus[1m]", label: "Opus (1M context)" },
		{ value: "sonnet", label: "Sonnet" },
	]);
});

test("a refused control request names the reason", () => {
	const stdout = answer({ subtype: "error", request_id: "trellis-models", error: "Unsupported control request" });
	expect(() => parseClaudeModels(stdout)).toThrow("claude did not list its models: Unsupported control request");
});

test("output without the answer names the output", () => {
	expect(() => parseClaudeModels("not signed in\n")).toThrow(
		"claude did not answer the initialize request: not signed in",
	);
});
