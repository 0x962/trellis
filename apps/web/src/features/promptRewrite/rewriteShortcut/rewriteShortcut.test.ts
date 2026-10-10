import { afterAll, afterEach, expect, test } from "bun:test";
import { type RewriteSelection, registerRewriteTarget } from "../rewriteTarget";
import { rewriteTestBrowser } from "../testSupport";
import { installRewriteShortcut } from "./rewriteShortcut";

const restore = rewriteTestBrowser();
afterAll(restore);
const cleanups: Array<() => void> = [];
afterEach(() => {
	for (const dispose of cleanups.splice(0)) dispose();
	document.body.replaceChildren();
});

function fixture() {
	const element = document.createElement("div");
	element.contentEditable = "true";
	document.body.append(element);
	let valid = true;
	let letters = 0;
	const calls: string[] = [];
	const selection: RewriteSelection = {
		element,
		text: "Keep every requirement.",
		valid: () => valid,
		insertKey: () => {
			letters += 1;
		},
		replace: () => null,
	};
	cleanups.push(registerRewriteTarget(element, { capture: () => (valid ? selection : null), selectAll: () => valid }));
	cleanups.push(installRewriteShortcut(document, (input) => calls.push(input.text)));
	const key = (key: string, options: KeyboardEventInit = {}) => {
		const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options });
		element.dispatchEvent(event);
		return event.defaultPrevented;
	};
	return {
		element,
		calls,
		key,
		letters: () => letters,
		invalidate: () => {
			valid = false;
		},
	};
}

test("two l taps rewrite exactly once without entering either l", () => {
	const h = fixture();
	expect(h.key("l")).toBe(true);
	expect(h.key("l")).toBe(true);
	expect(h.calls).toEqual(["Keep every requirement."]);
	expect(h.letters()).toBe(0);
});

test("one l enters text after the double tap interval", async () => {
	const h = fixture();
	h.key("l");
	await new Promise((resolve) => setTimeout(resolve, 340));
	expect(h.letters()).toBe(1);
	expect(h.calls).toEqual([]);
});

test("l then another key enters l before the next browser action", () => {
	const h = fixture();
	h.key("l");
	expect(h.key("x")).toBe(false);
	expect(h.letters()).toBe(1);
	expect(h.calls).toEqual([]);
});

test("repeat, composition and modifiers cannot trigger a rewrite", () => {
	const h = fixture();
	for (const options of [
		{ repeat: true },
		{ isComposing: true },
		{ metaKey: true },
		{ ctrlKey: true },
		{ altKey: true },
		{ shiftKey: true },
	]) {
		expect(h.key("l", options)).toBe(false);
		expect(h.key("l", options)).toBe(false);
	}
	expect(h.calls).toEqual([]);
});

test("a repeat after the first tap preserves normal text", () => {
	const h = fixture();
	h.key("l");
	expect(h.key("l", { repeat: true })).toBe(false);
	expect(h.letters()).toBe(1);
	expect(h.calls).toEqual([]);
});

test("pointer and paste actions flush the pending l before their default action", () => {
	const h = fixture();
	for (const type of ["pointerdown", "paste", "compositionstart"]) {
		h.key("l");
		h.element.dispatchEvent(new Event(type, { bubbles: true }));
	}
	expect(h.letters()).toBe(3);
	expect(h.calls).toEqual([]);
});

test("a changed target cannot start a rewrite", () => {
	const h = fixture();
	h.key("l");
	h.invalidate();
	expect(h.key("l")).toBe(false);
	expect(h.calls).toEqual([]);
});

test("an unregistered contenteditable never intercepts l", () => {
	const element = document.createElement("div");
	element.contentEditable = "true";
	document.body.append(element);
	cleanups.push(
		installRewriteShortcut(document, () => {
			throw new Error("Unexpected rewrite");
		}),
	);
	const event = new KeyboardEvent("keydown", { key: "l", bubbles: true, cancelable: true });
	element.dispatchEvent(event);
	expect(event.defaultPrevented).toBe(false);
});

for (const modifier of ["ctrlKey", "metaKey"]) {
	test(`${modifier} plus a selects all eligible native text`, () => {
		const element = document.createElement("textarea");
		element.value = "Keep all requirements.";
		document.body.append(element);
		element.focus();
		element.setSelectionRange(3, 3);
		cleanups.push(installRewriteShortcut(document, () => {}));
		const event = new KeyboardEvent("keydown", { key: "a", [modifier]: true, bubbles: true, cancelable: true });
		element.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
		expect([element.selectionStart, element.selectionEnd]).toEqual([0, element.value.length]);
	});
	test(`${modifier} plus a selects all registered rich text`, () => {
		const h = fixture();
		expect(h.key("a", { [modifier]: true })).toBe(true);
	});
}
