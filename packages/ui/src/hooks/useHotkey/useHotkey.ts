import { useEffect } from "react";

// A hotkey is a key name, or "mod+" and a key name. `mod` is Command on a
// Mac and Control elsewhere; both count, so one binding serves every
// platform.
export type Hotkey = string;

const editable = (target: EventTarget | null) =>
	target instanceof HTMLElement &&
	(target.isContentEditable ||
		target.tagName === "INPUT" ||
		target.tagName === "TEXTAREA" ||
		target.tagName === "SELECT");

// Runs `handler` on keydown of `hotkey` anywhere on the page. A plain key
// stays out of text fields, so typing "a" in the composer never approves a
// ticket; a mod chord fires everywhere.
export function useHotkey(hotkey: Hotkey, handler: (event: KeyboardEvent) => void) {
	useEffect(() => {
		const parts = hotkey.split("+");
		const key = parts[parts.length - 1]!.toLowerCase();
		const mod = parts.includes("mod");
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key.toLowerCase() !== key) return;
			if ((event.metaKey || event.ctrlKey) !== mod) return;
			if (!mod && editable(event.target)) return;
			handler(event);
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [hotkey, handler]);
}
