import { expect, test } from "bun:test";
import { parsePiModels } from "./piModels.ts";

const table = [
	"provider           model                           context  max-out  thinking  images",
	"anthropic          claude-sonnet-5                 1M       64K      yes       yes   ",
	"vercel-ai-gateway  anthropic/claude-fable-5        1M       128K     yes       yes   ",
	"",
].join("\n");

test("each row of the pi table is a provider/model flag value", () => {
	expect(parsePiModels(table)).toEqual([
		{ value: "anthropic/claude-sonnet-5", label: "anthropic/claude-sonnet-5" },
		{ value: "vercel-ai-gateway/anthropic/claude-fable-5", label: "vercel-ai-gateway/anthropic/claude-fable-5" },
	]);
});

test("a warning before the table is skipped", () => {
	expect(parsePiModels(`Warning: errors loading models.json\n${table}`)).toHaveLength(2);
});

test("output without the table names the output", () => {
	expect(() => parsePiModels("No models available. Sign in first.\n")).toThrow(
		"pi listed no models: No models available. Sign in first.",
	);
});
