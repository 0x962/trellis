import { expect } from "bun:test";

// Asserts that `element` carries every class in the space-separated `classes`.
// The failure lists only the missing names.
export const expectClasses = (element: Element, classes: string) => {
	const missing = classes.split(/\s+/).filter((name) => !element.classList.contains(name));
	expect(missing).toEqual([]);
};
