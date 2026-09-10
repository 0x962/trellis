import type { Scheduler } from "@trellis/api";

// The keyboard map at work. `useGlobalHotkeys` binds every row of
// `shortcuts` whose scope is global. Every other row is delegated: the
// focused surface registers its handlers with `useHotkeyTarget`, and the
// innermost registered target receives the key.

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

// Binds every global row. Returns the first key of a pending sequence, so
// the shell can draw the hint, or null.
export const useGlobalHotkeys = (_options: GlobalHotkeyOptions): string | null => null;

// The surfaces that take a delegated key. The innermost one wins.
export type HotkeyTargetScope = "list" | "board" | "peek" | "ticket" | "composer";

// The keys a target answers, each in the `shortcuts` spelling: "j",
// "shift+c", "mod+.", "backspace".
export type HotkeyHandlers = Record<string, (event: KeyboardEvent) => void>;

// Registers `handlers` for as long as the component stays mounted.
export const useHotkeyTarget = (_scope: HotkeyTargetScope, _handlers: HotkeyHandlers) => {};

// Escape runs one layer per press, the closest one first.
export type EscapeLayer = "popover" | "peek" | "selection";

// Registers `onEscape` while `active` is true.
export const useEscapeLayer = (_layer: EscapeLayer, _active: boolean, _onEscape: () => void) => {};
