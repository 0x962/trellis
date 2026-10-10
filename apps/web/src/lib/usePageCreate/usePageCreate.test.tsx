import { afterEach, beforeEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot } from "test-renderer";
import { usePageCreate } from "./usePageCreate";

const globals = new Map<string, PropertyDescriptor | undefined>();
let browser: Window;
let root: ReturnType<typeof createRoot>;
let calls: string[];

beforeEach(() => {
	browser = new Window();
	calls = [];
	for (const [name, value] of Object.entries({
		window: browser,
		document: browser.document,
		HTMLElement: browser.HTMLElement,
		KeyboardEvent: browser.KeyboardEvent,
		IS_REACT_ACT_ENVIRONMENT: true,
	})) {
		globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
	}
	root = createRoot();
});

afterEach(async () => {
	await act(async () => root.unmount());
	await browser.happyDOM.abort();
	for (const [name, descriptor] of globals) {
		if (descriptor) Object.defineProperty(globalThis, name, descriptor);
		else Reflect.deleteProperty(globalThis, name);
	}
	globals.clear();
});

function Page({ action, enabled = true }: { action: string; enabled?: boolean }) {
	usePageCreate(() => calls.push(action), enabled);
	return null;
}

async function mount(action: string, enabled = true) {
	await act(async () => root.render(<Page action={action} enabled={enabled} />));
}

function press(target: Element = document.body, init: KeyboardEventInit = {}) {
	const event = new KeyboardEvent("keydown", {
		key: "c",
		code: "KeyC",
		bubbles: true,
		cancelable: true,
		...init,
	});
	target.dispatchEvent(event);
	return event;
}

test("C invokes only the current page action after a page or tab change", async () => {
	for (const action of ["epic", "ticket", "document", "session", "flow"]) {
		await mount(action);
		expect(press().defaultPrevented).toBe(true);
	}
	expect(calls).toEqual(["epic", "ticket", "document", "session", "flow"]);
	await act(async () => root.render(<div />));
	expect(press().defaultPrevented).toBe(false);
	expect(calls).toHaveLength(5);
});

test("an archived or pending page action remains disabled", async () => {
	await mount("epic", false);
	expect(press().defaultPrevented).toBe(false);
	await mount("epic");
	press();
	await mount("epic", false);
	press();
	expect(calls).toEqual(["epic"]);
});

test("C leaves text fields, editable documents, and terminal targets unchanged", async () => {
	await mount("session");
	document.body.innerHTML = `<input /><textarea></textarea><select><option>C</option></select><div contenteditable="true"><span>Document</span></div><div role="textbox"><span>Prompt</span></div><div class="terminal-surface"><button>Terminal</button></div>`;
	for (const target of document.querySelectorAll(
		"input, textarea, select, [contenteditable] span, [role=textbox] span, button",
	)) {
		expect(press(target).defaultPrevented).toBe(false);
	}
	expect(calls).toEqual([]);
});

test("portal dialogs and popups block the page action even with focus outside them", async () => {
	await mount("ticket");
	for (const role of ["dialog", "alertdialog", "menu", "listbox"]) {
		const popup = document.createElement("div");
		popup.setAttribute("role", role);
		document.body.append(popup);
		expect(press().defaultPrevented).toBe(false);
		popup.remove();
	}
	expect(calls).toEqual([]);
	press();
	expect(calls).toEqual(["ticket"]);
});

test("modifier chords, held keys, and composition leave the page action unchanged", async () => {
	await mount("document");
	for (const init of [
		{ ctrlKey: true },
		{ metaKey: true },
		{ altKey: true },
		{ shiftKey: true },
		{ repeat: true },
		{ isComposing: true },
	]) {
		expect(press(document.body, init).defaultPrevented).toBe(false);
	}
	expect(calls).toEqual([]);
});

test("a consumed C event cannot trigger a second page action", async () => {
	await act(async () =>
		root.render(
			<>
				<Page action="epic" />
				<Page action="session" />
			</>,
		),
	);
	press();
	expect(calls).toEqual(["epic"]);
});
