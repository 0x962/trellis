import { describe, expect, test } from "bun:test";
import { rowClickOpens } from "./rowClickOpens";

// An element of a fake DOM tree. `closest` understands the three selector
// forms that `rowClickOpens` uses: `tag`, `tag:not([attribute])` and
// `[role=value]`.
class FakeElement {
	constructor(
		readonly tag: string,
		readonly attributes: Record<string, string> = {},
		readonly parent: FakeElement | null = null,
	) {}

	child(tag: string, attributes: Record<string, string> = {}) {
		return new FakeElement(tag, attributes, this);
	}

	contains(other: FakeElement) {
		for (let node: FakeElement | null = other; node !== null; node = node.parent) if (node === this) return true;
		return false;
	}

	matches(selector: string) {
		const role = /^\[role=(.+)\]$/.exec(selector);
		if (role !== null) return this.attributes.role === role[1];
		const not = /^(\w+):not\(\[([\w-]+)\]\)$/.exec(selector);
		if (not !== null) return this.tag === not[1] && !(not[2]! in this.attributes);
		return this.tag === selector;
	}

	closest(selectors: string) {
		const list = selectors.split(", ");
		for (let node: FakeElement | null = this; node !== null; node = node.parent)
			if (list.some((selector) => node.matches(selector))) return node;
		return null;
	}
}

const opens = (target: FakeElement, row: FakeElement) =>
	rowClickOpens(target as unknown as Element, row as unknown as Node);

describe("rowClickOpens", () => {
	const body = new FakeElement("body");
	const row = body.child("div", { role: "row" });
	const cell = row.child("div", { role: "gridcell" });

	test("opens on a click on the row link or on the text of a cell", () => {
		const link = row.child("a", { "data-row-link": "" });
		expect(opens(link, row)).toBe(true);
		expect(opens(link.child("span"), row)).toBe(true);
		expect(opens(cell.child("span"), row)).toBe(true);
	});

	test("does not open on a click in a picker menu in a portal outside the row", () => {
		const listbox = body.child("div", { role: "listbox" });
		expect(opens(listbox.child("div", { role: "option" }).child("span"), row)).toBe(false);
		expect(opens(body.child("div", { role: "dialog" }).child("span"), row)).toBe(false);
	});

	test("does not open on a click on an element that owns its click", () => {
		for (const [tag, attributes] of [
			["button", {}],
			["a", { href: "/t/TRL-1" }],
			["input", {}],
			["select", {}],
			["textarea", {}],
			["div", { role: "button" }],
			["div", { role: "checkbox" }],
			["div", { role: "listbox" }],
			["div", { role: "option" }],
			["div", { role: "menuitem" }],
			["div", { role: "menuitemcheckbox" }],
			["div", { role: "menuitemradio" }],
		] as const) {
			const control = cell.child(tag, attributes);
			expect(opens(control, row)).toBe(false);
			expect(opens(control.child("span"), row)).toBe(false);
		}
	});
});
