import { beforeEach, expect, test } from "bun:test";
import type { AssignChoice } from "../assignChoice";
import { recentWith, rememberChoice, useRecentChoices } from "./recentChoices";

const choice = (fields: Partial<AssignChoice> = {}): AssignChoice => ({
	preset: "claude",
	model: null,
	effort: null,
	accountId: null,
	...fields,
});

beforeEach(() => {
	useRecentChoices.setState({ recent: [] });
});

test("the newest choice comes first", () => {
	rememberChoice(choice());
	rememberChoice(choice({ preset: "codex" }));
	expect(useRecentChoices.getState().recent.map((entry) => entry.preset)).toEqual(["codex", "claude"]);
});

test("a repeated choice moves to the top and stays one entry", () => {
	const claude = choice();
	rememberChoice(claude);
	rememberChoice(choice({ preset: "codex" }));
	rememberChoice(claude);
	expect(useRecentChoices.getState().recent.map((entry) => entry.preset)).toEqual(["claude", "codex"]);
});

test("two choices of one harness and one model differ by effort and account", () => {
	rememberChoice(choice({ effort: "low" }));
	rememberChoice(choice({ effort: "high" }));
	rememberChoice(choice({ effort: "high", accountId: "01JAAAAAAAAAAAAAAAAAAAAAAA" }));
	expect(useRecentChoices.getState().recent).toHaveLength(3);
});

test("the list holds five choices", () => {
	for (const effort of ["low", "medium", "high", "xhigh", "max"] as const) rememberChoice(choice({ effort }));
	rememberChoice(choice({ preset: "codex" }));
	const recent = useRecentChoices.getState().recent;
	expect(recent).toHaveLength(5);
	expect(recent[0]).toMatchObject({ preset: "codex" });
	expect(recent.some((entry) => entry.effort === "low")).toBe(false);
});

test("the pure list keeps the stored order of the other entries", () => {
	const first = choice({ preset: "codex" });
	const second = choice({ preset: "muse" });
	expect(recentWith([first, second], second)).toEqual([second, first]);
});
