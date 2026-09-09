import { useEffect } from "react";

// A hotkey is a key name with "mod+" and "shift+" before it as needed:
// "p", "shift+p", "mod+k", "mod+shift+enter". `mod` is Command on a Mac and
// Control elsewhere; both count, so one binding serves every platform.
export type Hotkey = string;

const editable = (target: EventTarget | null) =>
	target instanceof HTMLElement &&
	(target.isContentEditable ||
		target.tagName === "INPUT" ||
		target.tagName === "TEXTAREA" ||
		target.tagName === "SELECT");

// Runs `handler` on keydown of `hotkey` anywhere on the page. A key without
// mod stays out of text fields, so typing "a" in the composer never approves
// a ticket; a mod chord fires everywhere. A letter or a named key (Enter)
// reads the same with Shift held, so the Shift state tells "p" from
// "shift+p". A punctuation key such as "?" is itself the shifted form on many
// layouts, so its Shift state is ignored.
//
// A binding matches on `event.key`, the character the layout produces. A
// punctuation key that needs Option on a layout still matches: Option+5 on
// a German Mac produces "[". A letter binding also matches on `event.code`,
// the physical key, so Cmd+K works on a Cyrillic layout. The grammar has
// no "alt", so a letter with Alt held matches no binding. Alt+A is a
// text-entry chord on a Mac, never the approval key.
export function useHotkey(hotkey: Hotkey, handler: (event: KeyboardEvent) => void) {
	useEffect(() => {
		const parts = hotkey.split("+");
		const key = parts[parts.length - 1]!.toLowerCase();
		const mod = parts.includes("mod");
		const shift = parts.includes("shift");
		const letter = /^[a-z]$/.test(key);
		const shiftMatters = key.length > 1 || letter;
		const onKeyDown = (event: KeyboardEvent) => {
			if (letter && event.altKey) return;
			const byCode = letter && event.code === `Key${key.toUpperCase()}`;
			if (event.key.toLowerCase() !== key && !byCode) return;
			if ((event.metaKey || event.ctrlKey) !== mod) return;
			if (shiftMatters && event.shiftKey !== shift) return;
			if (!mod && editable(event.target)) return;
			handler(event);
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [hotkey, handler]);
}
