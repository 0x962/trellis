import { expect, mock, test } from "bun:test";
import { runTicketEscape } from "./useTicketEscape";

type Focused = Parameters<typeof runTicketEscape>[0];

const actions = (reviewOpen = false) => ({
	reviewOpen,
	closeReview: mock(() => {}),
	returnToList: mock(() => {}),
});

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
	const handlers = actions();
	runTicketEscape(null, handlers);
	expect(handlers.returnToList).toHaveBeenCalledTimes(1);
});

test("Escape returns from an empty field", () => {
	const handlers = actions();
	runTicketEscape(field(""), handlers);
	expect(handlers.returnToList).toHaveBeenCalledTimes(1);
});

test("Escape keeps typed field text and removes focus", () => {
	const handlers = actions();
	const blur = mock(() => {});
	runTicketEscape(field("a half written comment", blur), handlers);
	expect(blur).toHaveBeenCalledTimes(1);
	expect(handlers.returnToList).not.toHaveBeenCalled();
});

test("Escape keeps typed rich text and removes focus", () => {
	const handlers = actions();
	const blur = mock(() => {});
	runTicketEscape(editor("a half written description", blur), handlers);
	expect(blur).toHaveBeenCalledTimes(1);
	expect(handlers.returnToList).not.toHaveBeenCalled();
});

test("Escape closes an embedded review before it returns to the ticket list", () => {
	const handlers = actions(true);
	runTicketEscape(null, handlers);
	expect(handlers.closeReview).toHaveBeenCalledTimes(1);
	expect(handlers.returnToList).not.toHaveBeenCalled();
});
