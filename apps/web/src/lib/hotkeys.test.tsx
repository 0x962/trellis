import { afterEach, beforeEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "test-renderer";
import { type GlobalHotkeyOptions, useGlobalHotkeys } from "./hotkeys";

const globals = new Map<string, PropertyDescriptor | undefined>();
let events: EventTarget;
let desktop: { trellisDesktop?: { platform: string } };
let root: ReturnType<typeof createRoot>;
let calls: string[];

beforeEach(() => {
	events = new EventTarget();
	desktop = {};
	calls = [];
	for (const [name, value] of Object.entries({
		document: events,
		window: desktop,
		HTMLElement: class {},
		IS_REACT_ACT_ENVIRONMENT: true,
	})) {
		globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
	}
	root = createRoot();
});

afterEach(async () => {
	await act(async () => root.unmount());
	for (const [name, descriptor] of globals) {
		if (descriptor) Object.defineProperty(globalThis, name, descriptor);
		else Reflect.deleteProperty(globalThis, name);
	}
	globals.clear();
});

async function mount() {
	const options: GlobalHotkeyOptions = {
		pathname: "/needs-you",
		navigate: (href) => calls.push(href),
		onPalette: () => calls.push("palette"),
		onSearch: () => calls.push("search"),
		onCompose: () => calls.push("compose"),
		onProjectPicker: () => calls.push("projects"),
		onBack: () => calls.push("back"),
		onForward: () => calls.push("forward"),
	};
	function Probe() {
		useGlobalHotkeys(options);
		return null;
	}
	await act(async () => root.render(<Probe />));
}

function press(key: string, modifiers: KeyboardEventInit = {}) {
	const event = Object.assign(new Event("keydown", { cancelable: true }), {
		key,
		code: `Key${key.toUpperCase()}`,
		metaKey: false,
		ctrlKey: false,
		shiftKey: false,
		altKey: false,
		...modifiers,
	});
	events.dispatchEvent(event);
	return event;
}

test("a regular browser keeps Cmd+K and Ctrl+K without opening the Trellis palette", async () => {
	await mount();
	expect(press("k", { metaKey: true }).defaultPrevented).toBe(false);
	expect(press("k", { ctrlKey: true }).defaultPrevented).toBe(false);
	expect(calls).toEqual([]);
});

test("the desktop app opens the palette once and consumes its shortcut", async () => {
	desktop.trellisDesktop = { platform: "darwin" };
	await mount();
	expect(press("k", { metaKey: true }).defaultPrevented).toBe(true);
	expect(calls).toEqual(["palette"]);
	expect(press("k", { ctrlKey: true }).defaultPrevented).toBe(true);
	expect(calls).toEqual(["palette", "palette"]);
});

test("other shortcuts and modifier combinations retain their behavior", async () => {
	await mount();
	press("k", { metaKey: true, shiftKey: true });
	press("k", { metaKey: true, altKey: true });
	press("/");
	press("c");
	press("[", { metaKey: true });
	press("]", { metaKey: true });
	expect(calls).toEqual(["search", "compose", "back", "forward"]);
});

test("unmount removes the desktop palette shortcut", async () => {
	desktop.trellisDesktop = { platform: "darwin" };
	await mount();
	await act(async () => root.render(<div />));
	expect(press("k", { metaKey: true }).defaultPrevented).toBe(false);
	expect(calls).toEqual([]);
});
