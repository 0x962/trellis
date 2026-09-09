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

type Bindings = Record<"o" | "s" | "q" | "a" | "altA" | "modK" | "bracket" | "altBracket" | "altOne", Mock<() => void>>;

function BindingProbe(on: Bindings) {
	useHotkey("o", on.o);
	useHotkey("s", on.s);
	useHotkey("q", on.q);
	useHotkey("a", on.a);
	useHotkey("alt+a", on.altA);
	useHotkey("mod+k", on.modK);
	useHotkey("[", on.bracket);
	useHotkey("alt+[", on.altBracket);
	useHotkey("alt+1", on.altOne);
	return null;
}

const bindings = (): Bindings => ({
	o: mock(),
	s: mock(),
	q: mock(),
	a: mock(),
	altA: mock(),
	modK: mock(),
	bracket: mock(),
	altBracket: mock(),
	altOne: mock(),
});

// Every counter of `bindings` at 0, except the ones in `hits`.
const hits = (on: Partial<Record<keyof Bindings, number>>) => ({
	o: 0,
	s: 0,
	q: 0,
	a: 0,
	altA: 0,
	modK: 0,
	bracket: 0,
	altBracket: 0,
	altOne: 0,
	...on,
});

const counts = (on: Bindings) =>
	Object.fromEntries(Object.entries(on).map(([name, handler]) => [name, handler.mock.calls.length]));

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
	// key "[". The binding matches on the character. A letter binding without
	// "alt" needs Alt released, so Alt+A, a text-entry chord on a Mac, never
	// approves a ticket.
	test('Option+5 on a German layout matches a "[" binding and Alt+letter chords match no plain binding', () => {
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

	// A letter binding matches the character the layout produces whenever that
	// character is a Latin letter. On Dvorak the physical S key produces "o";
	// on AZERTY the physical A key produces "q". The physical key never wins
	// over a Latin letter, so the "s" and "a" bindings stay quiet. Every
	// counter is asserted, so no other binding fires on the side.
	test("a Latin letter matches by character on Dvorak and AZERTY, never by physical key", () => {
		const on = bindings();
		render(<BindingProbe {...on} />);
		fireEvent.keyDown(document.body, { key: "o", code: "KeyS" });
		expect(counts(on)).toEqual(hits({ o: 1 }));
		fireEvent.keyDown(document.body, { key: "q", code: "KeyA" });
		expect(counts(on)).toEqual(hits({ o: 1, q: 1 }));
		fireEvent.keyDown(document.body, { key: "S", code: "KeyO", shiftKey: true });
		expect(counts(on)).toEqual(hits({ o: 1, q: 1 }));
	});

	// An "alt+" binding needs Alt held whatever the key kind. A punctuation
	// or digit binding without "alt+" accepts Alt either way, because Option
	// produces "[" on a German Mac. The plain "[" binding fires beside "alt+[".
	test('an "alt+" punctuation or digit chord needs Alt held, and the plain key accepts either', () => {
		const on = bindings();
		render(<BindingProbe {...on} />);
		fireEvent.keyDown(document.body, { key: "[", code: "BracketLeft", altKey: true });
		expect(counts(on)).toEqual(hits({ bracket: 1, altBracket: 1 }));
		fireEvent.keyDown(document.body, { key: "[", code: "BracketLeft" });
		expect(counts(on)).toEqual(hits({ bracket: 2, altBracket: 1 }));
		fireEvent.keyDown(document.body, { key: "1", code: "Digit1", altKey: true });
		expect(counts(on)).toEqual(hits({ bracket: 2, altBracket: 1, altOne: 1 }));
		fireEvent.keyDown(document.body, { key: "1", code: "Digit1" });
		expect(counts(on)).toEqual(hits({ bracket: 2, altBracket: 1, altOne: 1 }));
	});

	// The physical key decides only when the character is not a Latin letter,
	// so Cmd+K on a Cyrillic layout reaches the palette.
	test("a non-Latin character falls back to the physical key", () => {
		const on = bindings();
		render(<BindingProbe {...on} />);
		fireEvent.keyDown(document.body, { key: "л", code: "KeyK", metaKey: true });
		expect(counts(on)).toMatchObject({ modK: 1 });
		fireEvent.keyDown(document.body, { key: "[", code: "Digit5", altKey: true });
		expect(counts(on)).toMatchObject({ bracket: 1, a: 0, altA: 0 });
	});

	// "alt+a" is a chord of its own: Alt held with the letter. The plain "a"
	// binding needs Alt released, and the Alt chord needs Alt held.
	test('an "alt+" chord fires with Alt held and a plain letter fires without it', () => {
		const on = bindings();
		render(<BindingProbe {...on} />);
		fireEvent.keyDown(document.body, { key: "a", code: "KeyA", altKey: true });
		expect(counts(on)).toMatchObject({ a: 0, altA: 1 });
		fireEvent.keyDown(document.body, { key: "a", code: "KeyA" });
		expect(counts(on)).toMatchObject({ a: 1, altA: 1 });
		fireEvent.keyDown(document.body, { key: "å", code: "KeyA", altKey: true });
		expect(counts(on)).toMatchObject({ a: 1, altA: 2 });
	});
});
