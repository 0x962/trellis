import { expect, test } from "bun:test";
import { type ClickKeys, opensSheet } from "./opensSheet";

const click = (part: Partial<ClickKeys> = {}): ClickKeys => ({
	button: 0,
	metaKey: false,
	ctrlKey: false,
	shiftKey: false,
	altKey: false,
	...part,
});

test("a plain click of the primary button opens the sheet", () => {
	expect(opensSheet(click())).toBe(true);
});

test("a middle click keeps the link, for a new tab", () => {
	expect(opensSheet(click({ button: 1 }))).toBe(false);
});

test("a modifier key keeps the link", () => {
	expect(opensSheet(click({ metaKey: true }))).toBe(false);
	expect(opensSheet(click({ ctrlKey: true }))).toBe(false);
	expect(opensSheet(click({ shiftKey: true }))).toBe(false);
	expect(opensSheet(click({ altKey: true }))).toBe(false);
});
