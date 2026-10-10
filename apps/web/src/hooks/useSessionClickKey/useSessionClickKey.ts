import { isTextEntry } from "@trellis/ui";
import { useEffect, useRef } from "react";

let users = 0;
let held: { code: string; consumed: boolean; action?: { owner: symbol; run: () => void } } | null = null;

function keyDown(event: KeyboardEvent) {
	const matches = /^[a-z]$/i.test(event.key) ? event.key.toLowerCase() === "s" : event.code === "KeyS";
	if (!matches || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
	if (event.isComposing || event.defaultPrevented || isTextEntry(event.target)) return;
	if (!event.repeat) held = { code: event.code, consumed: false };
}

function release(event: KeyboardEvent) {
	if (event.code !== held?.code) return;
	const action = held.action;
	held = null;
	action?.run();
}

function clear() {
	held = null;
}

const consume = (event: Pick<MouseEvent, "button" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">) => {
	if (held === null || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)
		return false;
	held.consumed = true;
	held.action = undefined;
	return true;
};

// Every ticket surface shares the held S key. Its status action waits for
// key release, so S plus a click can cancel that action before a picker opens.
export function useSessionClickKey() {
	const owner = useRef(Symbol());
	useEffect(() => {
		if (users++ === 0) {
			window.addEventListener("keydown", keyDown, true);
			window.addEventListener("keyup", release, true);
			window.addEventListener("blur", clear);
		}
		return () => {
			if (held?.action?.owner === owner.current) held.action = undefined;
			if (--users === 0) {
				window.removeEventListener("keydown", keyDown, true);
				window.removeEventListener("keyup", release, true);
				window.removeEventListener("blur", clear);
				clear();
			}
		};
	}, []);
	return {
		consume,
		defer: (run: () => void) => {
			if (held !== null && !held.consumed) held.action = { owner: owner.current, run };
		},
	};
}
