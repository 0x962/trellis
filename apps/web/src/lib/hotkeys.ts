import { realScheduler, type Scheduler } from "@trellis/api";
import { useHotkey } from "@trellis/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { parseProjectSplat, projectHref } from "./projectPath";
import { toggleSidebarOnce } from "./sidebarHotkey";
import { toggleTheme } from "./theme";

// The keyboard map at work. `useGlobalHotkeys` binds every row of
// `shortcuts` whose scope is global. Every other row is delegated: the
// focused surface registers its handlers with `useHotkeyTarget`, and the
// innermost registered target receives the key. `g s` focuses the Filter
// button of the list's filter bar, or the bar itself when the page draws
// no button.

// A second key arrives within this window after `g`, or the sequence is
// dropped.
export const sequenceWindowMs = 800;

export type GlobalHotkeyOptions = {
	navigate: (to: string) => void;
	pathname: string;
	// `mod+k`.
	onPalette: () => void;
	// `/`.
	onSearch: () => void;
	// `c`.
	onCompose: () => void;
	// `?`.
	onHelp: () => void;
	// `g p`.
	onProjectPicker: () => void;
	scheduler?: Scheduler;
};

const editable = (target: EventTarget | null) =>
	target instanceof HTMLElement &&
	(target.isContentEditable ||
		target.tagName === "INPUT" ||
		target.tagName === "TEXTAREA" ||
		target.tagName === "SELECT");

// The view `g b` and `g t` switch to, on a project route only.
const viewHref = (pathname: string, view: "board" | "table") => {
	if (!pathname.startsWith("/p/")) return null;
	return projectHref(parseProjectSplat(pathname.slice(3)).ref, view);
};

// `[` and `]` move a focused card between board columns. A route that can
// show a board leaves both keys to the board, so one press never moves a
// card and collapses the sidebar at the same time. Every other route
// toggles the sidebar with `[`.
const holdsBoardKeys = (pathname: string) => pathname.startsWith("/p/") || pathname.startsWith("/all");

// The surfaces that take a delegated key. The innermost one wins.
export type HotkeyTargetScope = "list" | "board" | "ticket" | "composer";

// The keys a target answers, each in the `shortcuts` spelling: "j",
// "shift+c", "mod+.", "backspace".
export type HotkeyHandlers = Record<string, (event: KeyboardEvent) => void>;

type Target = { scope: HotkeyTargetScope; handlers: { current: HotkeyHandlers } };

// The last mounted target receives the key before other targets.
const targets: Target[] = [];

// The `shortcuts` spelling of a key press: "j", "shift+c", "mod+.".
const chordOf = (event: KeyboardEvent) => {
	const parts: string[] = [];
	if (event.metaKey || event.ctrlKey) parts.push("mod");
	if (event.shiftKey) parts.push("shift");
	if (event.altKey) parts.push("alt");
	parts.push(event.key.toLowerCase());
	return parts.join("+");
};

// Runs the innermost handler for the press. A key without a mod stays out
// of a text field, so typing never moves the list.
const runTarget = (event: KeyboardEvent) => {
	const chord = chordOf(event);
	const mod = event.metaKey || event.ctrlKey;
	if (!mod && editable(event.target)) return;
	for (let index = targets.length - 1; index >= 0; index -= 1) {
		const handler = targets[index]!.handlers.current[chord];
		if (handler === undefined) continue;
		event.preventDefault();
		handler(event);
		return;
	}
};

// One listener serves every target. The count keeps it alive while at
// least one target is mounted.
let listeners = 0;

// Registers `handlers` for as long as the component stays mounted.
export const useHotkeyTarget = (scope: HotkeyTargetScope, handlers: HotkeyHandlers) => {
	const current = useRef(handlers);
	current.current = handlers;
	useEffect(() => {
		const target: Target = { scope, handlers: current };
		targets.push(target);
		listeners += 1;
		if (listeners === 1) document.addEventListener("keydown", runTarget);
		return () => {
			targets.splice(targets.indexOf(target), 1);
			listeners -= 1;
			if (listeners === 0) document.removeEventListener("keydown", runTarget);
		};
	}, [scope]);
};

// Escape runs one layer per press, the closest one first.
export type EscapeLayer = "popover" | "selection";

const escapeOrder: EscapeLayer[] = ["popover", "selection"];

const openLayers = new Set<EscapeLayer>();

// Registers `onEscape` while `active` is true.
export const useEscapeLayer = (layer: EscapeLayer, active: boolean, onEscape: () => void) => {
	useEffect(() => {
		if (!active) return;
		openLayers.add(layer);
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			const closest = escapeOrder.find((name) => openLayers.has(name));
			if (closest !== layer) return;
			event.preventDefault();
			onEscape();
		};
		document.addEventListener("keydown", onKeyDown);
		return () => {
			openLayers.delete(layer);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [layer, active, onEscape]);
};

// Binds every global row. Returns the first key of a pending sequence, so
// the shell can draw the hint, or null.
export const useGlobalHotkeys = (options: GlobalHotkeyOptions): string | null => {
	const { navigate, pathname, onPalette, onSearch, onCompose, onHelp, onProjectPicker } = options;
	const scheduler = options.scheduler ?? realScheduler;
	const [pending, setPending] = useState<string | null>(null);
	const timer = useRef<unknown>(undefined);

	const clear = useCallback(() => {
		if (timer.current !== undefined) scheduler.clearTimeout(timer.current);
		timer.current = undefined;
		setPending(null);
	}, [scheduler]);

	useHotkey("mod+k", onPalette);
	useHotkey("/", onSearch);
	useHotkey("c", onCompose);
	useHotkey("?", onHelp);
	useHotkey("mod+\\", toggleTheme);
	useHotkey("[", (event) => {
		if (holdsBoardKeys(pathname)) return;
		toggleSidebarOnce(event);
	});
	useHotkey("g", () => {
		clear();
		setPending("g");
		timer.current = scheduler.setTimeout(() => {
			timer.current = undefined;
			setPending(null);
		}, sequenceWindowMs);
	});

	// The second key is read on the window in the capture phase. That runs
	// before every document listener, `useHotkey` included, so a page binding
	// never fires as the second half of a sequence.
	useEffect(() => {
		if (pending === null) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.metaKey || event.ctrlKey || event.altKey || editable(event.target)) return;
			const key = event.key.toLowerCase();
			if (key === "g") return;
			clear();
			const actions: Record<string, () => void> = {
				h: () => navigate("/needs-you"),
				a: () => navigate("/all"),
				p: onProjectPicker,
				s: () =>
					(
						document.querySelector<HTMLElement>("[data-filter-bar] [data-filter-button]") ??
						document.querySelector<HTMLElement>("[data-filter-bar]")
					)?.focus(),
				b: () => {
					const href = viewHref(pathname, "board");
					if (href !== null) navigate(href);
				},
				t: () => {
					const href = viewHref(pathname, "table");
					if (href !== null) navigate(href);
				},
			};
			const action = actions[key];
			if (action === undefined) return;
			event.preventDefault();
			event.stopPropagation();
			action();
		};
		window.addEventListener("keydown", onKeyDown, true);
		return () => window.removeEventListener("keydown", onKeyDown, true);
	}, [pending, clear, navigate, onProjectPicker, pathname]);

	useEffect(() => clear, [clear]);

	return pending;
};
