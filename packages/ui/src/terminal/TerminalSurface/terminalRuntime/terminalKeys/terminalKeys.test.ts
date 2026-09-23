import { expect, mock, test } from "bun:test";
import { escapePairMs, terminalKeys } from "./terminalKeys";

const keyEvent = (overrides: Partial<KeyboardEvent> = {}) =>
	({
		key: "Escape",
		type: "keydown",
		timeStamp: 0,
		repeat: false,
		ctrlKey: false,
		metaKey: false,
		altKey: false,
		shiftKey: false,
		stopPropagation: mock(() => {}),
		...overrides,
	}) as KeyboardEvent;

test("one Escape reaches the process and never reaches the page", () => {
	const leave = mock(() => {});
	const keys = terminalKeys(leave);
	const event = keyEvent();

	expect(keys(event)).toBe(true);
	expect(event.stopPropagation).toHaveBeenCalledTimes(1);
	expect(leave).not.toHaveBeenCalled();
});

test("a second Escape inside the pair window leaves the terminal and reaches the page", () => {
	const leave = mock(() => {});
	const keys = terminalKeys(leave);

	expect(keys(keyEvent({ timeStamp: 0 }))).toBe(true);
	const second = keyEvent({ timeStamp: escapePairMs });

	expect(keys(second)).toBe(false);
	expect(second.stopPropagation).not.toHaveBeenCalled();
	expect(leave).toHaveBeenCalledTimes(1);
});

test("a second Escape after the pair window stays inside the terminal", () => {
	const leave = mock(() => {});
	const keys = terminalKeys(leave);

	keys(keyEvent({ timeStamp: 0 }));
	const second = keyEvent({ timeStamp: escapePairMs + 1 });

	expect(keys(second)).toBe(true);
	expect(second.stopPropagation).toHaveBeenCalledTimes(1);
	expect(leave).not.toHaveBeenCalled();
});

test("the keyup of the leaving press repeats the answer of its keydown", () => {
	const leave = mock(() => {});
	const keys = terminalKeys(leave);

	keys(keyEvent({ timeStamp: 0 }));
	keys(keyEvent({ timeStamp: 10, type: "keyup" }));
	keys(keyEvent({ timeStamp: 200 }));
	const release = keyEvent({ timeStamp: 210, type: "keyup" });

	expect(keys(release)).toBe(false);
	expect(release.stopPropagation).not.toHaveBeenCalled();
	expect(leave).toHaveBeenCalledTimes(1);
});

test("a third Escape after a leaving pair starts a new pair", () => {
	const leave = mock(() => {});
	const keys = terminalKeys(leave);

	keys(keyEvent({ timeStamp: 0 }));
	keys(keyEvent({ timeStamp: 100 }));
	const third = keyEvent({ timeStamp: 200 });

	expect(keys(third)).toBe(true);
	expect(third.stopPropagation).toHaveBeenCalledTimes(1);
	expect(leave).toHaveBeenCalledTimes(1);
});

test("another key between two Escapes breaks the pair", () => {
	const leave = mock(() => {});
	const keys = terminalKeys(leave);

	keys(keyEvent({ timeStamp: 0 }));
	keys(keyEvent({ timeStamp: 10, key: "a" }));
	const second = keyEvent({ timeStamp: 20 });

	expect(keys(second)).toBe(true);
	expect(second.stopPropagation).toHaveBeenCalledTimes(1);
	expect(leave).not.toHaveBeenCalled();
});

test("a held Escape repeats into the process and never leaves the terminal", () => {
	const leave = mock(() => {});
	const keys = terminalKeys(leave);

	keys(keyEvent({ timeStamp: 0 }));
	const repeat = keyEvent({ timeStamp: 40, repeat: true });

	expect(keys(repeat)).toBe(true);
	expect(repeat.stopPropagation).toHaveBeenCalledTimes(1);
	expect(leave).not.toHaveBeenCalled();
});

test("terminal text and a modified Escape stay inside the terminal", () => {
	const keys = terminalKeys(mock(() => {}));
	for (const event of [
		keyEvent({ key: "a" }),
		keyEvent({ altKey: true }),
		keyEvent({ ctrlKey: true }),
		keyEvent({ metaKey: true }),
		keyEvent({ shiftKey: true }),
	]) {
		expect(keys(event)).toBe(true);
		expect(event.stopPropagation).toHaveBeenCalledTimes(1);
	}
});

test("Ctrl+] leaves the terminal once without terminal input", () => {
	const leave = mock(() => {});
	const keys = terminalKeys(leave);
	for (const type of ["keydown", "keyup"]) {
		const event = keyEvent({ key: "]", ctrlKey: true, type });
		expect(keys(event)).toBe(false);
		expect(event.stopPropagation).toHaveBeenCalledTimes(1);
	}
	expect(leave).toHaveBeenCalledTimes(1);
});
