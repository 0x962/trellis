import { expect, test } from "bun:test";
import { stepHarness } from "./stepHarness.ts";
import { flowDoc, node } from "./testDoc.ts";

const codex = { preset: "codex" as const, model: "openai/gpt-5.6-sol", effort: "high" as const };
const muse = { preset: "muse" as const };

test("a step's own harness wins, then the flow's, then claude", () => {
	const doc = flowDoc([node("a", "agent", null)], []);
	expect(stepHarness(doc, { harness: codex })).toEqual(codex);
	expect(stepHarness({ flow: { ...doc.flow, harness: muse } }, { harness: codex })).toEqual(codex);
	expect(stepHarness({ flow: { ...doc.flow, harness: muse } }, { harness: null })).toEqual(muse);
	expect(stepHarness(doc, { harness: null })).toEqual({ preset: "claude" });
});

test("a doc stored before the harness field existed reads as claude", () => {
	const doc = flowDoc([], []);
	const { harness: _flowHarness, ...flow } = doc.flow;
	expect(stepHarness({ flow: flow as typeof doc.flow }, {} as { harness: null })).toEqual({ preset: "claude" });
});
