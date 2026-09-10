import { realScheduler, type Scheduler } from "@trellis/api";
import { useHotkey } from "@trellis/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { parseProjectSplat, projectHref } from "./projectPath";
import { useSidebarHotkey } from "./sidebarHotkey";
import { toggleTheme } from "./theme";

export type HotkeyScopeProps = {
	navigate: (to: string) => void;
	pathname: string;
	// `g p`: the project picker.
	onProjectPicker: () => void;
	// `?`: the shortcut help.
	onHelp: () => void;
	scheduler?: Scheduler;
};

// A second key arrives within this window after `g`, or the sequence is
// dropped.
export const sequenceWindowMs = 800;

const editable = (target: EventTarget | null) =>
	target instanceof HTMLElement &&
	(target.isContentEditable ||
		target.tagName === "INPUT" ||
		target.tagName === "TEXTAREA" ||
		target.tagName === "SELECT");

// The view a `g b` or `g t` switches to, on a project route only.
const viewHref = (pathname: string, view: "board" | "table") => {
	if (!pathname.startsWith("/p/")) return null;
	return projectHref(parseProjectSplat(pathname.slice(3)).ref, view);
};

// The global keys: the `g` sequences, `[`, mod+\, and `?`. `g s` focuses
// the Filter button of the list's filter bar, or the bar itself. A pending
// sequence shows a "g…" hint bottom-left, read to a screen reader as a
// status. The second key is read in the capture phase, so a page's own
// single-letter binding never fires as the second half of a sequence.
export function HotkeyScope({
	navigate,
	pathname,
	onProjectPicker,
	onHelp,
	scheduler = realScheduler,
}: HotkeyScopeProps) {
	const [pending, setPending] = useState(false);
	const timer = useRef<unknown>(undefined);

	const clear = useCallback(() => {
		if (timer.current !== undefined) scheduler.clearTimeout(timer.current);
		timer.current = undefined;
		setPending(false);
	}, [scheduler]);

	useHotkey("g", () => {
		clear();
		setPending(true);
		timer.current = scheduler.setTimeout(() => {
			timer.current = undefined;
			setPending(false);
		}, sequenceWindowMs);
	});
	useSidebarHotkey();
	useHotkey("mod+\\", toggleTheme);
	useHotkey("?", onHelp);

	useEffect(() => {
		if (!pending) return;
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
		document.addEventListener("keydown", onKeyDown, true);
		return () => document.removeEventListener("keydown", onKeyDown, true);
	}, [pending, clear, navigate, onProjectPicker, pathname]);

	useEffect(() => clear, [clear]);

	if (!pending) return null;
	return (
		<output className="fixed bottom-4 left-4 z-50 inline-flex h-7 items-center rounded-md border border-border bg-elevated px-2 font-mono text-sm text-fg-muted shadow-md">
			g…
		</output>
	);
}
