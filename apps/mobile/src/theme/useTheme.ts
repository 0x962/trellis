import { useCallback, useSyncExternalStore } from "react";
import { Appearance } from "react-native";
import { useMMKVString } from "react-native-mmkv";
import { keys, store } from "../lib/store";

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const subscribe = (onChange: () => void) => {
	const subscription = Appearance.addChangeListener(onChange);
	return () => subscription.remove();
};

const systemScheme = (): ResolvedTheme => (Appearance.getColorScheme() === "dark" ? "dark" : "light");

// The theme choice. `mode` is what the person chose. It lives in MMKV under
// `trellis-theme`, so every mounted hook reads one value. A fresh install
// holds no value and shows dark. `resolved` is what the screen paints: the
// system scheme in system mode, else the mode itself.
export function useTheme() {
	const [stored, setStored] = useMMKVString(keys.theme, store);
	const system = useSyncExternalStore(subscribe, systemScheme);
	const mode = (stored ?? "dark") as ThemeMode;
	const resolved: ResolvedTheme = mode === "system" ? system : mode;
	const setTheme = useCallback((next: ThemeMode) => setStored(next), [setStored]);
	return { mode, resolved, setTheme };
}
