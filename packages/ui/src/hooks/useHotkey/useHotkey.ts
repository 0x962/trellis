import { useEffect } from "react";

// A hotkey is a key name with "mod+", "alt+", and "shift+" before it as
// needed: "p", "shift+p", "mod+k", "alt+a", "mod+shift+enter". `mod` is
// Command on a Mac and Control elsewhere; both count, so one binding serves
// every platform.
export type Hotkey = string;

export type HotkeyOptions = {
	allowInInput?: boolean;
};

const editable = (target: EventTarget | null) =>
	target instanceof HTMLElement &&
	(target.isContentEditable ||
		target.tagName === "INPUT" ||
		target.tagName === "TEXTAREA" ||
		target.tagName === "SELECT");

// A single Latin letter, in either case.
const latin = (value: string) => /^[a-z]$/i.test(value);

// Runs `handler` on keydown of `hotkey` anywhere on the page. A key without
// mod stays out of text fields unless `allowInInput` is true. A mod chord
// fires everywhere. A letter or a named key (Enter)
// reads the same with Shift held, so the Shift state tells "p" from
// "shift+p". A punctuation key such as "?" is itself the shifted form on many
// layouts, so its Shift state is ignored.
//
// A letter binding matches on `event.key`, the character the layout
// produces, whenever that character is a Latin letter: Dvorak's "o" is
// "o". When the character is not a Latin letter, the physical key decides
// (`event.code`), so Cmd+K works on a Cyrillic layout. An "alt+" binding
// needs Alt held whatever the key kind. A letter or a named key without
// "alt+" needs Alt released, so Alt+A, a text-entry chord on a Mac, fires
// no plain "a". A punctuation or digit key without "alt+" accepts Alt
// either way, because Option+5 on a German Mac produces "[".
export function useHotkey(hotkey: Hotkey, handler: (event: KeyboardEvent) => void, options: HotkeyOptions = {}) {
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
			if (alt && !event.altKey) return;
			if (!alt && !punctuation && event.altKey) return;
			if (!punctuation && event.shiftKey !== shift) return;
			if (!mod && !options.allowInInput && editable(event.target)) return;
			handler(event);
		};
		document.addEventListener("keydown", onKeyDown, { capture: true });
		return () => document.removeEventListener("keydown", onKeyDown, { capture: true });
	}, [hotkey, handler, options.allowInInput]);
}
