import { expect, mock, test } from "bun:test";
import { runTicketEscape } from "./useTicketEscape";

type Focused = Parameters<typeof runTicketEscape>[0];

const field = (value: string, blur = mock(() => {})): Focused =>
	({
		blur,
		isContentEditable: false,
		matches: () => true,
		textContent: "",
		value,
	}) as unknown as Focused;

const editor = (textContent: string, blur = mock(() => {})): Focused =>
	({
		blur,
		isContentEditable: true,
		matches: () => false,
		textContent,
	}) as unknown as Focused;

test("Escape returns when no editor has focus", () => {
	const returnToList = mock(() => {});
	runTicketEscape(null, returnToList);
	expect(returnToList).toHaveBeenCalledTimes(1);
});

test("Escape returns from an empty field", () => {
	const returnToList = mock(() => {});
	runTicketEscape(field(""), returnToList);
	expect(returnToList).toHaveBeenCalledTimes(1);
});

test("Escape keeps typed field text and removes focus", () => {
	const returnToList = mock(() => {});
	const blur = mock(() => {});
	runTicketEscape(field("a half written comment", blur), returnToList);
	expect(blur).toHaveBeenCalledTimes(1);
	expect(returnToList).not.toHaveBeenCalled();
});

test("Escape keeps typed rich text and removes focus", () => {
	const returnToList = mock(() => {});
	const blur = mock(() => {});
	runTicketEscape(editor("a half written description", blur), returnToList);
	expect(blur).toHaveBeenCalledTimes(1);
	expect(returnToList).not.toHaveBeenCalled();
});
