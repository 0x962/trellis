import { expect } from "bun:test";

// Asserts that `element` carries every class in the space-separated `classes`.
// The failure lists only the missing names.
export const expectClasses = (element: Element, classes: string) => {
	const missing = classes.split(/\s+/).filter((name) => !element.classList.contains(name));
	expect(missing).toEqual([]);
};

// Asserts that keyboard focus draws the 2 px accent ring. In Tailwind v4,
// `outline-none` sets `--tw-outline-style: none` on the element, and
// `focus-visible:outline-2` draws with `outline-style: var(--tw-outline-style)`,
// so the pair leaves the ring invisible. A control that draws the ring
// therefore never carries `outline-none`.
export const expectFocusRing = (element: Element) => {
	expectClasses(element, "focus-visible:outline-2 focus-visible:outline-accent");
	expect(element.classList.contains("outline-none")).toBe(false);
	expect(element.classList.contains("outline-hidden")).toBe(false);
};
