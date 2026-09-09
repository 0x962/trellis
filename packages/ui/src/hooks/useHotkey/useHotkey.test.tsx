import { describe, expect, type Mock, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { useHotkey } from "./useHotkey";

function Probe({ onA, onModK }: { onA: () => void; onModK: () => void }) {
	useHotkey("a", onA);
	useHotkey("mod+k", onModK);
	return <input aria-label="Title" />;
}

function LayoutProbe(on: { onBracket: () => void; onA: () => void; onModK: () => void }) {
	useHotkey("[", on.onBracket);
	useHotkey("a", on.onA);
	useHotkey("mod+k", on.onModK);
	return null;
}

type Handlers = Record<
	"p" | "shiftP" | "modC" | "modShiftC" | "modEnter" | "modShiftEnter" | "question",
	Mock<() => void>
>;

function ShiftProbe(on: Handlers) {
	useHotkey("p", on.p);
	useHotkey("shift+p", on.shiftP);
	useHotkey("mod+c", on.modC);
	useHotkey("mod+shift+c", on.modShiftC);
	useHotkey("mod+enter", on.modEnter);
	useHotkey("mod+shift+enter", on.modShiftEnter);
	useHotkey("?", on.question);
	return null;
}

describe("useHotkey", () => {
	test("a shift chord and its plain key are two bindings", () => {
		const on: Handlers = {
			p: mock(),
			shiftP: mock(),
			modC: mock(),
			modShiftC: mock(),
			modEnter: mock(),
			modShiftEnter: mock(),
			question: mock(),
		};
		render(<ShiftProbe {...on} />);
		const calls = () =>
			Object.fromEntries(Object.entries(on).map(([name, handler]) => [name, handler.mock.calls.length]));

		fireEvent.keyDown(document.body, { key: "P", shiftKey: true });
		expect(calls()).toMatchObject({ p: 0, shiftP: 1 });
		fireEvent.keyDown(document.body, { key: "p" });
		expect(calls()).toMatchObject({ p: 1, shiftP: 1 });

		fireEvent.keyDown(document.body, { key: "c", metaKey: true, shiftKey: true });
		expect(calls()).toMatchObject({ modC: 0, modShiftC: 1 });
		fireEvent.keyDown(document.body, { key: "c", metaKey: true });
		expect(calls()).toMatchObject({ modC: 1, modShiftC: 1 });

		fireEvent.keyDown(document.body, { key: "Enter", metaKey: true, shiftKey: true });
		expect(calls()).toMatchObject({ modEnter: 0, modShiftEnter: 1 });
		fireEvent.keyDown(document.body, { key: "Enter", ctrlKey: true });
		expect(calls()).toMatchObject({ modEnter: 1, modShiftEnter: 1 });

		// "?" is Shift+/ on a US keyboard. The key name carries the shift.
		fireEvent.keyDown(document.body, { key: "?", shiftKey: true });
		expect(calls()).toMatchObject({ question: 1 });
	});

	// On a German Mac layout "[" is Option+5, so the event carries altKey with
	// key "[". The binding matches on the character. The hotkey grammar has no
	// "alt", so a letter with Alt held matches no binding. Alt+A is a
	// text-entry chord on a Mac, never the approval key.
	test('Option+5 on a German layout matches a "[" binding and Alt+letter chords match nothing', () => {
		const onBracket = mock();
		const onA = mock();
		const onModK = mock();
		render(<LayoutProbe onBracket={onBracket} onA={onA} onModK={onModK} />);
		fireEvent.keyDown(document.body, { key: "[", code: "Digit5", altKey: true });
		expect(onBracket).toHaveBeenCalledTimes(1);
		fireEvent.keyDown(document.body, { key: "å", code: "KeyA", altKey: true });
		fireEvent.keyDown(document.body, { key: "a", code: "KeyA", altKey: true });
		fireEvent.keyDown(document.body, { key: "k", code: "KeyK", metaKey: true, altKey: true });
		expect(onA).not.toHaveBeenCalled();
		expect(onModK).not.toHaveBeenCalled();
	});

	// On a Cyrillic layout the physical K key produces "л", so a letter
	// binding also matches on the key code. A punctuation binding matches on
	// the character only: the physical "[" key produces "х" and matches nothing.
	test("a letter binding matches the physical key on a non-Latin layout", () => {
		const onBracket = mock();
		const onA = mock();
		const onModK = mock();
		render(<LayoutProbe onBracket={onBracket} onA={onA} onModK={onModK} />);
		fireEvent.keyDown(document.body, { key: "л", code: "KeyK", metaKey: true });
		expect(onModK).toHaveBeenCalledTimes(1);
		fireEvent.keyDown(document.body, { key: "ф", code: "KeyA" });
		expect(onA).toHaveBeenCalledTimes(1);
		fireEvent.keyDown(document.body, { key: "х", code: "BracketLeft" });
		expect(onBracket).not.toHaveBeenCalled();
	});

	test("fires on the key, honors mod, ignores editable targets, cleans up", () => {
		const onA = mock();
		const onModK = mock();
		const { unmount } = render(<Probe onA={onA} onModK={onModK} />);

		fireEvent.keyDown(document.body, { key: "a" });
		expect(onA).toHaveBeenCalledTimes(1);
		expect(onModK).not.toHaveBeenCalled();

		fireEvent.keyDown(document.body, { key: "k" });
		expect(onModK).not.toHaveBeenCalled();
		fireEvent.keyDown(document.body, { key: "k", metaKey: true });
		expect(onModK).toHaveBeenCalledTimes(1);

		const input = screen.getByRole("textbox", { name: "Title" });
		input.focus();
		fireEvent.keyDown(input, { key: "a" });
		expect(onA).toHaveBeenCalledTimes(1);

		unmount();
		fireEvent.keyDown(document.body, { key: "a" });
		fireEvent.keyDown(document.body, { key: "k", metaKey: true });
		expect(onA).toHaveBeenCalledTimes(1);
		expect(onModK).toHaveBeenCalledTimes(1);
	});
});
