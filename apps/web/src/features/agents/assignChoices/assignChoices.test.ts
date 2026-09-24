import { beforeEach, expect, test } from "bun:test";
import type { AssignChoice } from "../assignChoice";
import { assignChoiceActions, recentWith, useAssignChoices } from "./assignChoices";

const choice = (fields: Partial<AssignChoice> = {}): AssignChoice => ({
	preset: "claude",
	model: null,
	effort: null,
	accountId: null,
	...fields,
});

beforeEach(() => {
	useAssignChoices.setState({ recent: [] });
});

test("the newest choice comes first", () => {
	assignChoiceActions.remember(choice());
	assignChoiceActions.remember(choice({ preset: "codex" }));
	expect(useAssignChoices.getState().recent.map((entry) => entry.preset)).toEqual(["codex", "claude"]);
});

test("a repeated choice moves to the top and stays one entry", () => {
	const claude = choice();
	assignChoiceActions.remember(claude);
	assignChoiceActions.remember(choice({ preset: "codex" }));
	assignChoiceActions.remember(claude);
	expect(useAssignChoices.getState().recent.map((entry) => entry.preset)).toEqual(["claude", "codex"]);
});

test("two choices of one harness and one model differ by effort and account", () => {
	assignChoiceActions.remember(choice({ effort: "low" }));
	assignChoiceActions.remember(choice({ effort: "high" }));
	assignChoiceActions.remember(choice({ effort: "high", accountId: "01JAAAAAAAAAAAAAAAAAAAAAAA" }));
	expect(useAssignChoices.getState().recent).toHaveLength(3);
});

test("the list holds five choices", () => {
	for (const effort of ["low", "medium", "high", "xhigh", "max"] as const)
		assignChoiceActions.remember(choice({ effort }));
	assignChoiceActions.remember(choice({ preset: "codex" }));
	const recent = useAssignChoices.getState().recent;
	expect(recent).toHaveLength(5);
	expect(recent[0]).toMatchObject({ preset: "codex" });
	expect(recent.some((entry) => entry.effort === "low")).toBe(false);
});

test("the pure list keeps the stored order of the other entries", () => {
	const first = choice({ preset: "codex" });
	const second = choice({ preset: "muse" });
	expect(recentWith([first, second], second)).toEqual([second, first]);
});
