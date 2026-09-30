import { Window } from "happy-dom";

export function createResizeBrowser() {
	const browser = new Window({ url: "http://localhost:5188", settings: { disableIframePageLoading: true } });
	const globals = new Map<string, PropertyDescriptor | undefined>();
	const captures = new Map<number, HTMLElement>();
	const observers = new Map<() => void, Set<Element>>();
	const media = new Map<string, MediaQueryList>();
	let narrow = false;
	class Observer {
		private targets = new Set<Element>();
		constructor(private read: () => void) {
			observers.set(read, this.targets);
		}
		observe(target: Element) {
			this.targets.add(target);
		}
		unobserve(target: Element) {
			this.targets.delete(target);
		}
		disconnect() {
			observers.delete(this.read);
		}
	}
	Object.defineProperty(browser, "matchMedia", {
		value: (query: string) => {
			if (!media.has(query)) {
				const events = new browser.EventTarget();
				Object.defineProperties(events, {
					media: { value: query },
					matches: { get: () => query === "(width < 48rem)" && narrow },
					onchange: { value: null, writable: true },
					addListener: { value: () => {} },
					removeListener: { value: () => {} },
				});
				media.set(query, events as unknown as MediaQueryList);
			}
			return media.get(query)!;
		},
	});
	Object.defineProperties(browser.HTMLElement.prototype, {
		setPointerCapture: {
			value(this: HTMLElement, id: number) {
				captures.set(id, this);
			},
		},
		hasPointerCapture: {
			value(this: HTMLElement, id: number) {
				return captures.get(id) === this;
			},
		},
		releasePointerCapture: {
			value(id: number) {
				captures.delete(id);
			},
		},
		scrollIntoView: { value() {} },
	});
	for (const name of [
		"window",
		"document",
		"navigator",
		"location",
		"localStorage",
		"HTMLElement",
		"Element",
		"Node",
		"Text",
		"Document",
		"DocumentFragment",
		"MutationObserver",
		"NodeFilter",
		"DOMParser",
		"getComputedStyle",
		"requestAnimationFrame",
		"cancelAnimationFrame",
		"Event",
		"CustomEvent",
		"KeyboardEvent",
		"MouseEvent",
		"PointerEvent",
		"ResizeObserver",
		"IS_REACT_ACT_ENVIRONMENT",
	]) {
		globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		const value =
			name === "window"
				? browser
				: name === "ResizeObserver"
					? Observer
					: name === "IS_REACT_ACT_ENVIRONMENT"
						? true
						: Reflect.get(browser, name);
		Object.defineProperty(globalThis, name, {
			configurable: true,
			writable: true,
			value: ["getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"].includes(name)
				? value.bind(browser)
				: value,
		});
	}
	return {
		captures,
		resize: (target: Element) => {
			for (const [read, targets] of observers) if (targets.has(target)) read();
		},
		setNarrow: (value: boolean) => {
			narrow = value;
			for (const list of media.values()) list.dispatchEvent(new Event("change"));
		},
		pointer: (target: HTMLElement, type: string, x: number, pointerId = 1) => {
			const recipient = captures.get(pointerId) ?? target;
			recipient.dispatchEvent(
				new PointerEvent(type, { bubbles: true, cancelable: true, pointerId, clientX: x, button: 0, isPrimary: true }),
			);
		},
		close: async () => {
			await browser.happyDOM.abort();
			for (const [name, descriptor] of globals) {
				if (descriptor) Object.defineProperty(globalThis, name, descriptor);
				else Reflect.deleteProperty(globalThis, name);
			}
		},
	};
}
