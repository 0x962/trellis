import { afterEach, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import { renderTicket } from "../../../../../ticketHost";
import { Title } from "../../../../../../src/features/ticket/Title/Title";

const nativeResizeObserver = globalThis.ResizeObserver;
afterEach(() => {
	globalThis.ResizeObserver = nativeResizeObserver;
});

test("the title height follows the panel width without a text edit", async () => {
	const observers = new Map<Element, ResizeObserverCallback>();
	globalThis.ResizeObserver = class implements ResizeObserver {
		constructor(private callback: ResizeObserverCallback) {}
		observe(element: Element) {
			observers.set(element, this.callback);
		}
		unobserve() {}
		disconnect() {}
	};
	const view = renderTicket("CDE-42", (ticket) => <Title ticket={ticket} />, { path: "/t/CDE-42" });
	const title = await screen.findByRole("textbox", { name: "Title" });
	let height = 96;
	Object.defineProperty(title, "scrollHeight", { configurable: true, get: () => height });
	const callback = observers.get(title);
	expect(callback).toBeDefined();
	callback!([{ target: title, contentRect: { width: 320 } } as unknown as ResizeObserverEntry], {} as ResizeObserver);
	expect(title.style.height).toBe("96px");
	height = 32;
	callback!([{ target: title, contentRect: { width: 800 } } as unknown as ResizeObserverEntry], {} as ResizeObserver);
	expect(title.style.height).toBe("32px");
	view.unmount();
});
