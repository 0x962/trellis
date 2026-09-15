import { expect, test } from "bun:test";
import { terminalInputSource } from "./terminalInputSource.ts";

test("terminal replies outside a user event do not claim user input", async () => {
	const host = document.createElement("div");
	const textarea = document.createElement("textarea");
	host.append(textarea);
	const source = terminalInputSource(host);
	const observed: boolean[] = [];
	textarea.addEventListener("keydown", () => observed.push(source.isUserInput()));
	expect(source.isUserInput()).toBe(false);
	textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
	expect(observed).toEqual([true]);
	await Promise.resolve();
	expect(source.isUserInput()).toBe(false);
	source.dispose();
});

test("paste and composition input carry user provenance until their event completes", async () => {
	const host = document.createElement("div");
	const textarea = document.createElement("textarea");
	host.append(textarea);
	const source = terminalInputSource(host);
	for (const name of ["paste", "compositionend", "input"]) {
		const observed: boolean[] = [];
		textarea.addEventListener(name, () => observed.push(source.isUserInput()), { once: true });
		textarea.dispatchEvent(new Event(name, { bubbles: true }));
		expect(observed).toEqual([true]);
		await Promise.resolve();
		expect(source.isUserInput()).toBe(false);
	}
	source.dispose();
	textarea.dispatchEvent(new Event("input", { bubbles: true }));
	expect(source.isUserInput()).toBe(false);
});

test("deferred composition text keeps provenance without marking a terminal reply", async () => {
	const host = document.createElement("div");
	const textarea = document.createElement("textarea");
	host.append(textarea);
	const source = terminalInputSource(host);
	textarea.dispatchEvent(Object.assign(new Event("compositionend", { bubbles: true }), { data: "入力" }));
	await Promise.resolve();
	expect(source.isUserInput("\x1b[1;1R")).toBe(false);
	expect(source.isUserInput("入力")).toBe(true);
	expect(source.isUserInput("入力")).toBe(false);
	source.dispose();
});
