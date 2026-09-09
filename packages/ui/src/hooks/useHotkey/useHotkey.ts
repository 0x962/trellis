import { useEffect } from "react";

// A hotkey is a key name with "mod+", "alt+", and "shift+" before it as
// needed: "p", "shift+p", "mod+k", "alt+a", "mod+shift+enter". `mod` is
// Command on a Mac and Control elsewhere; both count, so one binding serves
// every platform.
export type Hotkey = string;

const editable = (target: EventTarget | null) =>
	target instanceof HTMLElement &&
	(target.isContentEditable ||
		target.tagName === "INPUT" ||
		target.tagName === "TEXTAREA" ||
		target.tagName === "SELECT");

// A single Latin letter, in either case.
const latin = (value: string) => /^[a-z]$/i.test(value);

// Runs `handler` on keydown of `hotkey` anywhere on the page. A key without
// mod stays out of text fields, so typing "a" in the composer never approves
// a ticket; a mod chord fires everywhere. A letter or a named key (Enter)
// reads the same with Shift held, so the Shift state tells "p" from
// "shift+p". A punctuation key such as "?" is itself the shifted form on many
// layouts, so its Shift state is ignored.
//
// A letter binding matches on `event.key`, the character the layout
// produces, whenever that character is a Latin letter: Dvorak's "o" is
// "o". When the character is not a Latin letter, the physical key decides
// (`event.code`), so Cmd+K works on a Cyrillic layout. A letter or a named
// key needs the Alt state of its binding: "a" needs Alt released and
// "alt+a" needs Alt held. A punctuation key ignores Alt, because Option+5
// on a German Mac produces "[".
export function useHotkey(hotkey: Hotkey, handler: (event: KeyboardEvent) => void) {
	useEffect(() => {
		const parts = hotkey.split("+");
		const key = parts[parts.length - 1]!.toLowerCase();
		const mod = parts.includes("mod");
		const alt = parts.includes("alt");
		const shift = parts.includes("shift");
		const letter = latin(key);
		const punctuation = key.length === 1 && !letter;
		const matches = (event: KeyboardEvent) => {
			if (letter && !latin(event.key)) return event.code === `Key${key.toUpperCase()}`;
			return event.key.toLowerCase() === key;
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (!matches(event)) return;
			if ((event.metaKey || event.ctrlKey) !== mod) return;
			if (!punctuation && event.altKey !== alt) return;
			if (!punctuation && event.shiftKey !== shift) return;
			if (!mod && editable(event.target)) return;
			handler(event);
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [hotkey, handler]);
}
