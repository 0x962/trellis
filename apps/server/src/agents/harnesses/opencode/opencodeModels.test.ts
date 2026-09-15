import { expect, test } from "bun:test";
import { parseOpenCodeModels } from "./opencodeModels.ts";

test("each line of the opencode list is a provider/model flag value", () => {
	expect(parseOpenCodeModels("opencode/big-pickle\nopenai/gpt-5.5\n\nanthropic/claude-sonnet-5\n")).toEqual([
		{ value: "opencode/big-pickle", label: "opencode/big-pickle" },
		{ value: "openai/gpt-5.5", label: "openai/gpt-5.5" },
		{ value: "anthropic/claude-sonnet-5", label: "anthropic/claude-sonnet-5" },
	]);
});

test("an empty list is an error", () => {
	expect(() => parseOpenCodeModels("\n")).toThrow("opencode listed no models");
});
