import { Window } from "happy-dom";

export function rewriteTestBrowser() {
	const browser = new Window({ url: "http://localhost:4173" });
	const saved = new Map<string, PropertyDescriptor | undefined>();
	for (const name of [
		"window",
		"document",
		"navigator",
		"HTMLElement",
		"HTMLTextAreaElement",
		"Element",
		"Node",
		"DocumentFragment",
		"MutationObserver",
		"getComputedStyle",
		"requestAnimationFrame",
		"cancelAnimationFrame",
		"CustomEvent",
		"Event",
		"KeyboardEvent",
		"MouseEvent",
		"PointerEvent",
	]) {
		saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		const value = name === "window" ? browser : Reflect.get(browser, name);
		Object.defineProperty(globalThis, name, {
			configurable: true,
			writable: true,
			value: ["getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"].includes(name)
				? value.bind(browser)
				: value,
		});
	}
	return async () => {
		await browser.happyDOM.abort();
		for (const [name, descriptor] of saved) {
			if (descriptor) Object.defineProperty(globalThis, name, descriptor);
			else Reflect.deleteProperty(globalThis, name);
		}
	};
}
