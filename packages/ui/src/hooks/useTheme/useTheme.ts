import { useEffect, useSyncExternalStore } from "react";
import { useMediaQuery } from "../useMediaQuery";

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

// The localStorage key that holds the chosen mode.
export const themeStorageKey = "trellis-theme";

// The chosen mode lives in localStorage and every hook reads it from there,
// so two consumers on one page never disagree. `setTheme` notifies every
// mounted hook.
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
	listeners.add(listener);
	return () => listeners.delete(listener);
};

const read = (): ThemeMode => (localStorage.getItem(themeStorageKey) as ThemeMode | null) ?? "system";

// Stamps the mode on <html> as data-theme, which the tokens read. In system
// mode nothing is stamped and the media query decides.
const stamp = (mode: ThemeMode) => {
	const root = document.documentElement;
	if (mode === "system") root.removeAttribute("data-theme");
	else root.setAttribute("data-theme", mode);
};

// A theme switch is never animated. Every control carries a color transition
// for hover, so data-theme-switch on <html> turns every transition off
// (tokens.css) while the palette swaps. The attribute comes off two frames
// later. The first frame paints the new palette. The second frame sees only
// the transition property change, so no control fades between themes.
export const setTheme = (next: ThemeMode) => {
	const root = document.documentElement;
	localStorage.setItem(themeStorageKey, next);
	root.setAttribute("data-theme-switch", "");
	stamp(next);
	for (const listener of listeners) listener();
	requestAnimationFrame(() => requestAnimationFrame(() => root.removeAttribute("data-theme-switch")));
};

// The theme choice. `mode` is what the person chose; `resolved` is what the
// screen shows.
export function useTheme() {
	const mode = useSyncExternalStore(subscribe, read);
	const systemDark = useMediaQuery("(prefers-color-scheme: dark)");
	useEffect(() => {
		stamp(read());
	}, []);
	const resolved: ResolvedTheme = mode === "system" ? (systemDark ? "dark" : "light") : mode;
	return { mode, resolved, setTheme };
}
