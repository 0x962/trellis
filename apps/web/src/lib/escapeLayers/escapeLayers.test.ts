import { expect, mock, test } from "bun:test";
import { createEscapeLayers } from "./escapeLayers";

const escapeEvent = (overrides = {}) => ({
	key: "Escape",
	defaultPrevented: false,
	repeat: false,
	isComposing: false,
	preventDefault: mock(() => {}),
	...overrides,
});

test("one press closes the top control before selection and navigation", () => {
	const layers = createEscapeLayers();
	const back = mock(() => {});
	const clear = mock(() => {});
	const close = mock(() => {});
	layers.register("navigation", back);
	const removeSelection = layers.register("selection", clear);
	const removePopover = layers.register("popover", close);
	const first = escapeEvent();
	layers.handle(first);
	expect(close).toHaveBeenCalledTimes(1);
	expect(first.preventDefault).toHaveBeenCalledTimes(1);
	expect(clear).not.toHaveBeenCalled();
	expect(back).not.toHaveBeenCalled();
	removePopover();
	layers.handle(escapeEvent());
	expect(clear).toHaveBeenCalledTimes(1);
	expect(back).not.toHaveBeenCalled();
	removeSelection();
	layers.handle(escapeEvent());
	expect(back).toHaveBeenCalledTimes(1);
});

test("nested registrations retain the outer control after the inner control closes", () => {
	const layers = createEscapeLayers();
	const outer = mock(() => {});
	const inner = mock(() => {});
	layers.register("popover", outer);
	const remove = layers.register("popover", inner);
	layers.handle(escapeEvent());
	expect(inner).toHaveBeenCalledTimes(1);
	expect(outer).not.toHaveBeenCalled();
	remove();
	layers.handle(escapeEvent());
	expect(outer).toHaveBeenCalledTimes(1);
});

test("an inactive surface declines Escape so navigation can handle it", () => {
	const layers = createEscapeLayers();
	const back = mock(() => {});
	layers.register("navigation", back);
	layers.register("selection", () => false);
	layers.handle(escapeEvent());
	expect(back).toHaveBeenCalledTimes(1);
});

test("consumed, held, composing, and non-Escape keys do not navigate", () => {
	const layers = createEscapeLayers();
	const back = mock(() => {});
	layers.register("navigation", back);
	for (const value of [{ defaultPrevented: true }, { repeat: true }, { isComposing: true }, { key: "Enter" }]) {
		const event = escapeEvent(value);
		layers.handle(event);
		expect(event.preventDefault).not.toHaveBeenCalled();
	}
	expect(back).not.toHaveBeenCalled();
});
