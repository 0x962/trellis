import { afterEach, beforeEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { pageSheetActions, usePageSheetStore } from "../../../../../../../stores/pageSheetStore";
import { useSessionRowClick } from "./useSessionRowClick";

const globals = new Map<string, PropertyDescriptor | undefined>();
let browser: Window;
let root: ReturnType<typeof createRoot>;
let selected: string[];

beforeEach(async () => {
	browser = new Window();
	selected = [];
	for (const [name, value] of Object.entries({
		window: browser,
		document: browser.document,
		HTMLElement: browser.HTMLElement,
		KeyboardEvent: browser.KeyboardEvent,
		MouseEvent: browser.MouseEvent,
		Event: browser.Event,
		IS_REACT_ACT_ENVIRONMENT: true,
	})) {
		globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
	}
	const container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	function Rows() {
		const onClick = useSessionRowClick((id) => selected.push(id));
		return (
			<>
				<input aria-label="Search sessions" />
				<button type="button" onClick={(event) => onClick({ id: "agent", ticketIdentifier: "TRL-1610" }, event)}>
					Ticket agent
				</button>
				<button type="button" onClick={(event) => onClick({ id: "session", ticketIdentifier: null }, event)}>
					Standalone session
				</button>
			</>
		);
	}
	pageSheetActions.closeTicket();
	await act(async () => root.render(<Rows />));
});

afterEach(async () => {
	await act(async () => root.unmount());
	pageSheetActions.closeTicket();
	await browser.happyDOM.abort();
	for (const [name, descriptor] of globals) {
		if (descriptor) Object.defineProperty(globalThis, name, descriptor);
		else Reflect.deleteProperty(globalThis, name);
	}
	globals.clear();
});

function key(type: "keydown" | "keyup", options: KeyboardEventInit = {}, target: EventTarget = document) {
	target.dispatchEvent(new KeyboardEvent(type, { key: "t", code: "KeyT", bubbles: true, ...options }));
}

function click(index = 0, options: MouseEventInit = {}) {
	document.querySelectorAll("button")[index]!.dispatchEvent(new MouseEvent("click", { bubbles: true, ...options }));
}

test("T-click opens the ticket directly without selecting its conversation", () => {
	key("keydown");
	click();
	expect(usePageSheetStore.getState().ticket).toBe("TRL-1610");
	expect(selected).toEqual([]);
});

test("a plain click and a click after T release select the conversation", () => {
	click();
	key("keydown");
	key("keyup");
	click();
	expect(selected).toEqual(["agent", "agent"]);
	expect(usePageSheetStore.getState().ticket).toBeNull();
});

test("T-click keeps standalone sessions available", () => {
	key("keydown");
	click(1);
	expect(selected).toEqual(["session"]);
	expect(usePageSheetStore.getState().ticket).toBeNull();
});

test("text entry, composition, and modified keys do not arm the shortcut", () => {
	key("keydown", {}, document.querySelector("input")!);
	click();
	for (const options of [{ isComposing: true }, { metaKey: true }, { ctrlKey: true }, { altKey: true }]) {
		key("keydown", options);
		click();
	}
	expect(selected).toEqual(Array(5).fill("agent"));
	expect(usePageSheetStore.getState().ticket).toBeNull();
});

test("window blur releases T when its keyup occurs outside the app", () => {
	key("keydown");
	window.dispatchEvent(new Event("blur"));
	click();
	expect(selected).toEqual(["agent"]);
	expect(usePageSheetStore.getState().ticket).toBeNull();
});

test("modified clicks preserve conversation selection while T is held", () => {
	key("keydown");
	for (const options of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }]) click(0, options);
	expect(selected).toEqual(Array(3).fill("agent"));
	expect(usePageSheetStore.getState().ticket).toBeNull();
});
