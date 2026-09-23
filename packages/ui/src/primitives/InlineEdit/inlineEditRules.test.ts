import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { inlineEditAction, inlineEditRules, runInlineEdit } from "./inlineEditRules";

const enter = { kind: "key", key: "Enter" } as const;
const escapeKey = { kind: "key", key: "Escape" } as const;
const blur = { kind: "blur" } as const;

test("Enter saves the typed value", () => {
	expect(inlineEditAction(enter, "New name", "Old name")).toEqual({
		kind: "save",
		value: "New name",
		focus: "value",
	});
});

test("a lost focus saves the typed value", () => {
	expect(inlineEditAction(blur, "New name", "Old name")).toEqual({
		kind: "save",
		value: "New name",
		focus: "none",
	});
});

test("Escape closes the field and sends nothing", () => {
	expect(inlineEditAction(escapeKey, "New name", "Old name")).toEqual({ kind: "close", focus: "value" });
});

test("no other key ends the edit", () => {
	for (const key of ["Tab", "a", "ArrowDown", "Backspace", " ", "Delete", "Home"]) {
		expect(inlineEditAction({ kind: "key", key }, "New name", "Old name")).toEqual({ kind: "ignore" });
	}
});

test("an empty value sent with Enter is refused and the field stays open", () => {
	expect(inlineEditAction(enter, "", "Old name")).toEqual({ kind: "refuse" });
	expect(inlineEditAction(enter, "   ", "Old name")).toEqual({ kind: "refuse" });
});

// A phone keyboard has no Escape key. If an empty field held the focus after
// every tap outside it, a person on a phone could not reach another control.
test("an empty value that loses the focus closes the field", () => {
	expect(inlineEditAction(blur, "", "Old name")).toEqual({ kind: "close", focus: "none" });
	expect(inlineEditAction(blur, "   ", "Old name")).toEqual({ kind: "close", focus: "none" });
});

test("Escape cancels an empty field", () => {
	expect(inlineEditAction(escapeKey, "", "Old name")).toEqual({ kind: "close", focus: "value" });
});

test("a value equal to the saved one closes the field and sends nothing", () => {
	expect(inlineEditAction(enter, "Old name", "Old name")).toEqual({ kind: "close", focus: "value" });
	expect(inlineEditAction(blur, "Old name", "Old name")).toEqual({ kind: "close", focus: "none" });
});

test("spaces at the two ends do not make a new value", () => {
	expect(inlineEditAction(enter, "  Old name  ", "Old name")).toEqual({ kind: "close", focus: "value" });
	expect(inlineEditAction(enter, "Old name", "  Old name  ")).toEqual({ kind: "close", focus: "value" });
});

test("a saved value loses the spaces at its two ends", () => {
	expect(inlineEditAction(enter, "  New name  ", "Old name")).toEqual({
		kind: "save",
		value: "New name",
		focus: "value",
	});
});

test("Enter and Escape give the focus to the value, and a lost focus does not move it", () => {
	expect(inlineEditAction(enter, "New name", "Old name")).toMatchObject({ focus: "value" });
	expect(inlineEditAction(escapeKey, "New name", "Old name")).toMatchObject({ focus: "value" });
	expect(inlineEditAction(blur, "New name", "Old name")).toMatchObject({ focus: "none" });
});

const accepts = async () => {};
const refuses = async () => {
	throw new Error("A session with this name already exists.");
};

test("a lost focus after a typed name sends the name to the server", async () => {
	const sent: string[] = [];
	const outcome = await runInlineEdit(blur, "New name", "Old name", async (next) => {
		sent.push(next);
	});

	expect(sent).toEqual(["New name"]);
	expect(outcome).toEqual({ kind: "saved", value: "New name", focus: "none" });
});

test("Escape sends nothing to the server", async () => {
	const sent: string[] = [];
	const outcome = await runInlineEdit(escapeKey, "New name", "Old name", async (next) => {
		sent.push(next);
	});

	expect(sent).toEqual([]);
	expect(outcome).toEqual({ kind: "closed", focus: "value" });
});

test("an empty value sends nothing to the server and says what to do", async () => {
	const sent: string[] = [];
	const outcome = await runInlineEdit(enter, "  ", "Old name", async (next) => {
		sent.push(next);
	});

	expect(sent).toEqual([]);
	expect(outcome).toEqual({ kind: "refused", value: "  ", message: "Enter a name." });
});

test("a refusal keeps the typed value and names the reason", async () => {
	const outcome = await runInlineEdit(enter, "New name", "Old name", refuses);

	expect(outcome).toEqual({
		kind: "refused",
		value: "New name",
		message: "A session with this name already exists.",
	});
});

test("the field shuts to more typing before the server call, and only then", async () => {
	const order: string[] = [];
	await runInlineEdit(
		enter,
		"New name",
		"Old name",
		async () => {
			order.push("save");
		},
		{ onSaving: () => order.push("saving") },
	);
	await runInlineEdit(escapeKey, "New name", "Old name", accepts, { onSaving: () => order.push("saving") });

	expect(order).toEqual(["saving", "save"]);
});

// `docs/UI_PATTERNS.md` is the page a person reads before they build a screen,
// and `inlineEditRules` is the list the gallery draws. Two copies of one rule
// drift apart, so this test holds them equal.
test("the numbered list in docs/UI_PATTERNS.md holds the same rules as this file", () => {
	const doc = readFileSync(new URL("../../../../../docs/UI_PATTERNS.md", import.meta.url), "utf8");
	const section = doc.slice(doc.indexOf("## Edit a short value in place"));
	const printed = [...section.matchAll(/^\d+\. (.+)$/gm)].map((match) => match[1]);

	expect(printed).toEqual([...inlineEditRules]);
});
