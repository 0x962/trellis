import { afterAll, afterEach, expect, test } from "bun:test";
import { rewriteTestBrowser } from "../testSupport";
import { nativeRewriteTarget } from "./nativeRewriteTarget";

const restore = rewriteTestBrowser();
afterAll(restore);
afterEach(() => document.body.replaceChildren());

function field() {
	const element = document.createElement("textarea");
	element.value = "Keep 7 days. Do not delete files.";
	document.body.append(element);
	element.focus();
	element.select();
	return element;
}

test("only a complete nonempty editable selection can rewrite", () => {
	const element = field();
	expect(nativeRewriteTarget(element)?.text).toBe(element.value);
	element.setSelectionRange(1, 5);
	expect(nativeRewriteTarget(element)).toBeNull();
	element.select();
	element.readOnly = true;
	expect(nativeRewriteTarget(element)).toBeNull();
	element.readOnly = false;
	element.disabled = true;
	expect(nativeRewriteTarget(element)).toBeNull();
	element.disabled = false;
	element.value = "   ";
	element.select();
	expect(nativeRewriteTarget(element)).toBeNull();
});

test("terminals and explicitly excluded fields cannot rewrite", () => {
	const element = field();
	const terminal = document.createElement("div");
	terminal.className = "xterm";
	document.body.append(terminal);
	terminal.append(element);
	expect(nativeRewriteTarget(element)).toBeNull();
	document.body.append(element);
	element.dataset.rewriteDisabled = "";
	expect(nativeRewriteTarget(element)).toBeNull();
});

test("a late result cannot replace edited, detached, unfocused or newly read-only text", () => {
	const element = field();
	const selection = nativeRewriteTarget(element)!;
	expect(selection.valid()).toBe(true);
	element.value += " More.";
	expect(selection.valid()).toBe(false);
	element.value = selection.text;
	element.select();
	element.blur();
	expect(selection.valid()).toBe(false);
	element.focus();
	element.readOnly = true;
	expect(selection.valid()).toBe(false);
	element.readOnly = false;
	element.remove();
	expect(selection.valid()).toBe(false);
});
