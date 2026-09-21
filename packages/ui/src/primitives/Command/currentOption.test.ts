import { expect, test } from "bun:test";
import { currentOption } from "./currentOption";

test("finds the current option under a later group", () => {
	const groups = [
		{ heading: "Unstarted", items: [{ id: "todo", label: "Todo" }] },
		{ heading: "Started", items: [{ id: "human-review", label: "Human Review", current: true }] },
	];

	expect(currentOption([], groups)).toBe("human-review");
});

test("finds the first checked option of a multi-value list", () => {
	const items = [
		{ id: "bug", label: "Bug", checked: false },
		{ id: "ui", label: "UI", checked: true },
		{ id: "api", label: "API", checked: true },
	];

	expect(currentOption(items, [])).toBe("ui");
});

test("skips an option that some of the tickets carry", () => {
	const items = [
		{ id: "bug", label: "Bug", checked: "mixed" as const },
		{ id: "ui", label: "UI", checked: true },
	];

	expect(currentOption(items, [])).toBe("ui");
});

test("finds no option in a list with no value", () => {
	expect(currentOption([{ id: "todo", label: "Todo" }], [])).toBeUndefined();
});
