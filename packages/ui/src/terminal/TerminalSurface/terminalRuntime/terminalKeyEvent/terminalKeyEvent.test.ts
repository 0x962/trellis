import { expect, mock, test } from "bun:test";
import { terminalKeyEvent } from "./terminalKeyEvent";

const keyEvent = (overrides: Partial<KeyboardEvent> = {}) =>
	({
		key: "Escape",
		type: "keydown",
		ctrlKey: false,
		metaKey: false,
		altKey: false,
		shiftKey: false,
		stopPropagation: mock(() => {}),
		...overrides,
	}) as KeyboardEvent;

test("bare Escape reaches the page without terminal input", () => {
	const event = keyEvent();
	const leave = mock(() => {});
	expect(terminalKeyEvent(event, leave)).toBe(false);
	expect(event.stopPropagation).not.toHaveBeenCalled();
	expect(leave).not.toHaveBeenCalled();
});

test("terminal text and modified Escape stay inside the terminal", () => {
	for (const event of [keyEvent({ key: "a" }), keyEvent({ altKey: true }), keyEvent({ ctrlKey: true })]) {
		expect(
			terminalKeyEvent(
				event,
				mock(() => {}),
			),
		).toBe(true);
		expect(event.stopPropagation).toHaveBeenCalledTimes(1);
	}
});

test("Ctrl+] leaves the terminal once without terminal input", () => {
	const leave = mock(() => {});
	for (const type of ["keydown", "keyup"]) {
		const event = keyEvent({ key: "]", ctrlKey: true, type });
		expect(terminalKeyEvent(event, leave)).toBe(false);
		expect(event.stopPropagation).toHaveBeenCalledTimes(1);
	}
	expect(leave).toHaveBeenCalledTimes(1);
});
