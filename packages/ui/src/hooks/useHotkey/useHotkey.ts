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
// layouts, so its Shift state is ignored. The grammar has no "alt", so a key
// pressed with Alt held matches no binding: Alt+A is a text-entry chord on a
// Mac, never the approval key.
export function useHotkey(hotkey: Hotkey, handler: (event: KeyboardEvent) => void) {
	useEffect(() => {
		const parts = hotkey.split("+");
		const key = parts[parts.length - 1]!.toLowerCase();
		const mod = parts.includes("mod");
		const shift = parts.includes("shift");
		const shiftMatters = key.length > 1 || /[a-z]/.test(key);
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key.toLowerCase() !== key) return;
			if (event.altKey) return;
			if ((event.metaKey || event.ctrlKey) !== mod) return;
			if (shiftMatters && event.shiftKey !== shift) return;
			if (!mod && editable(event.target)) return;
			handler(event);
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [hotkey, handler]);
}
