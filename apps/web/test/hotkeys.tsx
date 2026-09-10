import { mock } from "bun:test";
import { fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { SequenceHint } from "../src/features/command/SequenceHint";
import {
	type EscapeLayer,
	type GlobalHotkeyOptions,
	type HotkeyHandlers,
	type HotkeyTargetScope,
	useEscapeLayer,
	useGlobalHotkeys,
	useHotkeyTarget,
} from "../src/lib/hotkeys";
import { shortcuts } from "../src/lib/shortcuts";

export const press = (key: string, init: KeyboardEventInit = {}, target: Element = document.body) =>
	fireEvent.keyDown(target, { key, ...init });

// The event for one row of the shortcut map: "mod+shift+c" presses c with
// Command and Shift held.
export const pressKeys = (keys: string) => {
	const parts = keys.split("+");
	const last = parts[parts.length - 1]!;
	press(last === "backspace" ? "Backspace" : last, {
		metaKey: parts.includes("mod"),
		shiftKey: parts.includes("shift"),
	});
};

function Scope({ options }: { options: GlobalHotkeyOptions }) {
	return <SequenceHint pending={useGlobalHotkeys(options)} />;
}

// Mounts the global keys with a mock for every handler and a clock the
// test moves.
export const mountScope = (pathname = "/needs-you", scheduler?: GlobalHotkeyOptions["scheduler"]) => {
	const spies = {
		navigate: mock((_to: string) => {}),
		onPalette: mock(() => {}),
		onSearch: mock(() => {}),
		onCompose: mock(() => {}),
		onHelp: mock(() => {}),
		onProjectPicker: mock(() => {}),
	};
	const options: GlobalHotkeyOptions = { ...spies, pathname, scheduler };
	const view = render(<Scope options={options} />);
	return {
		...spies,
		unmount: view.unmount,
		rerender: (next: string) => view.rerender(<Scope options={{ ...options, pathname: next }} />),
	};
};

function Target({ scope, handlers }: { scope: HotkeyTargetScope; handlers: HotkeyHandlers }) {
	useHotkeyTarget(scope, handlers);
	return null;
}

// Registers one mock per key on `scope`.
export const mountTarget = (scope: HotkeyTargetScope, keys: string[]) => {
	const spies: Record<string, ReturnType<typeof mock>> = {};
	for (const key of keys) spies[key] = mock(() => {});
	const view = render(<Target scope={scope} handlers={spies} />);
	return { spies, unmount: view.unmount };
};

function EscapeStack({ log }: { log: string[] }) {
	const [open, setOpen] = useState<Record<EscapeLayer, boolean>>({ popover: true, peek: true, selection: true });
	const close = (layer: EscapeLayer) => () => {
		log.push(layer);
		setOpen((current) => ({ ...current, [layer]: false }));
	};
	useEscapeLayer("popover", open.popover, close("popover"));
	useEscapeLayer("peek", open.peek, close("peek"));
	useEscapeLayer("selection", open.selection, close("selection"));
	return null;
}

// Renders an open popover, an open peek, and a selection, and records the
// order in which Escape closes them.
export const mountEscapeStack = () => {
	const log: string[] = [];
	render(<EscapeStack log={log} />);
	return log;
};

// Counts the keydown listeners added to and removed from `document`.
export const trackListeners = () => {
	const add = document.addEventListener;
	const remove = document.removeEventListener;
	const counts = { added: 0, removed: 0 };
	document.addEventListener = ((type: string, ...rest: unknown[]) => {
		if (type === "keydown") counts.added += 1;
		return (add as (...args: unknown[]) => void).call(document, type, ...rest);
	}) as typeof document.addEventListener;
	document.removeEventListener = ((type: string, ...rest: unknown[]) => {
		if (type === "keydown") counts.removed += 1;
		return (remove as (...args: unknown[]) => void).call(document, type, ...rest);
	}) as typeof document.removeEventListener;
	return {
		counts,
		restore: () => {
			document.addEventListener = add;
			document.removeEventListener = remove;
		},
	};
};

// A focused text field on the page.
export const focusedField = () => {
	const input = document.createElement("input");
	document.body.appendChild(input);
	input.focus();
	return input;
};

// The rows a global binding owns, and the rows a target owns.
export const globalRows = () => shortcuts.filter((row) => row.scope === "global");

export const scopedRows = () => shortcuts.filter((row) => row.scope !== "global");
