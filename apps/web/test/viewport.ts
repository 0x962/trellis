import { afterEach } from "bun:test";

// happy-dom lays nothing out, so every box is 0 by 0. The table's scroll
// container carries `data-table-viewport`; this gives it a height, so the
// virtualizer mounts the rows that fit and no more.
export const mockViewport = (height: number, width = 1200) => {
	const original = Element.prototype.getBoundingClientRect;
	Element.prototype.getBoundingClientRect = function (this: Element) {
		if (!this.hasAttribute("data-table-viewport")) return original.call(this);
		return { x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON: () => ({}) } as DOMRect;
	};
	return () => {
		Element.prototype.getBoundingClientRect = original;
	};
};

// Installs a viewport of `height` px for the file and removes it after each
// test.
export const tableViewport = (height = 800) => {
	let restore: (() => void) | null = null;
	const install = () => {
		restore = mockViewport(height);
	};
	afterEach(() => {
		restore?.();
		restore = null;
	});
	return install;
};
