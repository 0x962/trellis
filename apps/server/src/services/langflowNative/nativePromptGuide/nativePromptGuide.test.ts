import { expect, test } from "bun:test";
import type { launchGuide } from "../../agentPrompt/launchGuide";
import { nativePromptGuide } from "./nativePromptGuide";

test("adds the original absolute deadline at guide time without changing the retained run", async () => {
	const deadlineAt = Date.parse("2026-09-29T09:00:00Z");
	let now = deadlineAt - 10_000;
	const ctx = { now: () => new Date(now) } as Parameters<typeof launchGuide>[0];
	const input = {
		run: { instruction: "immutable prompt" },
		message: "retained message",
		workspace: "/fixture/work",
	} as Parameters<typeof launchGuide>[1];
	const seen: Parameters<typeof launchGuide>[1][] = [];
	const guide = nativePromptGuide({ deadlineAt, budgetMs: 120_000 }, async (_ctx, value) => {
		seen.push(value);
		return value.message!;
	});
	expect(await guide(ctx, input)).toContain("10000 ms.");
	now += 7_000;
	const result = await guide(ctx, input);
	expect(result).toContain("2026-09-29T09:00:00.000Z");
	expect(result).toContain("3000 ms.");
	expect(result).toContain("120000 ms.");
	expect(result).toStartWith("retained message\n\n");
	expect(seen[0]!.run).toBe(input.run);
	expect(seen[0]!.workspace).toBe(input.workspace);
	expect(input.message).toBe("retained message");
});

test("keeps the normal guide input when the visit has no deadline", async () => {
	const ctx = {} as Parameters<typeof launchGuide>[0];
	const input = { message: undefined } as Parameters<typeof launchGuide>[1];
	await nativePromptGuide({}, async (_ctx, value) => {
		expect(value).toEqual(input);
		return "guide";
	})(ctx, input);
});
