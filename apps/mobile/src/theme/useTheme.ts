import { useCallback, useSyncExternalStore } from "react";
import { Appearance } from "react-native";
import { keys } from "../lib/store";
import { useStoredString } from "../lib/useStoredString";

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const subscribe = (onChange: () => void) => {
	const subscription = Appearance.addChangeListener(onChange);
	return () => subscription.remove();
};

const systemScheme = (): ResolvedTheme => (Appearance.getColorScheme() === "dark" ? "dark" : "light");

// The theme choice. `mode` is what the person chose. It lives in the store
// under `trellis-theme`, so every mounted hook reads one value. A fresh
// install holds no value and shows dark. `resolved` is what the screen
// paints: the system scheme in system mode, else the mode itself.
export function useTheme() {
	const [stored, setStored] = useStoredString(keys.theme);
	const system = useSyncExternalStore(subscribe, systemScheme);
	const mode = (stored ?? "dark") as ThemeMode;
	const resolved: ResolvedTheme = mode === "system" ? system : mode;
	const setTheme = useCallback((next: ThemeMode) => setStored(next), [setStored]);
	return { mode, resolved, setTheme };
}
