import { setTheme, type ThemeMode, themeStorageKey, useTheme as useUiTheme } from "@trellis/ui";

// Dark is the default. The ui hook treats a missing key as system, so the
// web writes dark before the hook reads on a fresh profile. The head script
// in index.html does the same before the first paint.
export const ensureThemeStored = () => {
	if (localStorage.getItem(themeStorageKey) === null) localStorage.setItem(themeStorageKey, "dark");
};

const resolvedMode = (): "dark" | "light" => {
	const mode = localStorage.getItem(themeStorageKey) as ThemeMode;
	if (mode !== "system") return mode;
	return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

// Flips between dark and light, from whatever the screen shows now.
export const toggleTheme = () => {
	ensureThemeStored();
	setTheme(resolvedMode() === "dark" ? "light" : "dark");
};

export function useTheme() {
	ensureThemeStored();
	return useUiTheme();
}
