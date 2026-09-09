import { useEffect, useState } from "react";
import { useMediaQuery } from "../useMediaQuery";

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

// The localStorage key that holds the chosen mode.
export const themeStorageKey = "trellis-theme";

const readStored = (): ThemeMode => (localStorage.getItem(themeStorageKey) as ThemeMode | null) ?? "system";

// The theme choice. `mode` is what the person chose; `resolved` is what the
// screen shows. The choice is stamped on <html> as data-theme, which the
// tokens read, and stored so it survives a reload. In system mode nothing is
// stamped and the media query decides.
export function useTheme() {
	const [mode, setMode] = useState<ThemeMode>(readStored);
	const systemDark = useMediaQuery("(prefers-color-scheme: dark)");
	useEffect(() => {
		const root = document.documentElement;
		if (mode === "system") root.removeAttribute("data-theme");
		else root.setAttribute("data-theme", mode);
	}, [mode]);
	const setTheme = (next: ThemeMode) => {
		localStorage.setItem(themeStorageKey, next);
		setMode(next);
	};
	const resolved: ResolvedTheme = mode === "system" ? (systemDark ? "dark" : "light") : mode;
	return { mode, resolved, setTheme };
}
