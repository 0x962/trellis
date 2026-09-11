import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { blocks, parseCss, readSource } from "../../../packages/ui/test/css";

const read = () => Bun.file(join(import.meta.dir, "app.css")).text();

// A statement is one `@import` or `@source` line without a body.
const statements = (css: string) =>
	css
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.split(";")
		.map((line) => line.trim())
		.filter((line) => line.startsWith("@"));

// Whether a `:has(` opens while another `:has(` is still open. The stack
// holds one entry per open parenthesis: true for a :has(), false for any
// other.
const nestsHas = (selector: string) => {
	const open: boolean[] = [];
	for (let index = 0; index < selector.length; index++) {
		if (selector.startsWith(":has(", index)) {
			if (open.includes(true)) return true;
			open.push(true);
			index += ":has".length;
		} else if (selector[index] === "(") open.push(false);
		else if (selector[index] === ")") open.pop();
	}
	return false;
};

describe("app.css", () => {
	// WS-03. Tailwind emits only the classes it finds in scanned files. The
	// primitives live in packages/ui, outside the web root, so app.css names
	// that directory as a source or the primitives render unstyled.
	test("app.css imports the ui tokens and fonts and scans packages/ui for classes", async () => {
		const lines = statements(await read());
		expect(lines).toContain('@import "tailwindcss"');
		expect(lines).toContain('@import "@trellis/ui/tokens.css"');
		expect(lines).toContain('@import "@trellis/ui/fonts.css"');
		const source = lines.find((line) => line.startsWith("@source"));
		expect(source).toBeString();
		expect(source).toMatch(/packages\/ui\/src/);
	});

	// A GFM task item shows its checkbox as the marker. marked renders the
	// checkbox as the first child of the item, and the Tiptap editor marks
	// the item with data-type="taskItem". Either form draws no bullet.
	test("a task list item draws no bullet and a list of task items has no left padding", async () => {
		const css = (await read()).replace(/\/\*[\s\S]*?\*\//g, "");
		const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, selector, body]) => ({
			selector: selector!.trim(),
			body: body!,
		}));
		const noBullet = rules.find((rule) => /list-style:\s*none/.test(rule.body));
		expect(noBullet?.selector ?? "no rule").toContain('li:has(> input[type="checkbox"])');
		expect(noBullet?.selector ?? "no rule").toContain('li[data-type="taskItem"]');
		const noPadding = rules.find((rule) => /padding-left:\s*0/.test(rule.body));
		expect(noPadding?.selector ?? "no rule").toContain('ul[data-type="taskList"]');
		expect(noPadding?.selector ?? "no rule").toContain('ul:has(> li > input[type="checkbox"])');
		// CSS forbids a :has() inside a :has(), and a browser drops the whole
		// rule, every selector in its list included.
		const nested = rules.filter((rule) => nestsHas(rule.selector));
		expect(nested.map((rule) => rule.selector)).toEqual([]);
	});
});

test("markdown code, images, and editor content use square corners", async () => {
	const pieces = parseCss(await Bun.file(new URL("./app.css", import.meta.url)).text());
	const tokens = Object.assign(
		{},
		...blocks(parseCss(await readSource("tokens.css")))
			.filter((piece) => piece.prelude.startsWith("@theme"))
			.map((piece) => piece.declarations),
	);
	const violations: string[] = [];
	for (const rule of blocks(pieces)) {
		for (const [property, value] of Object.entries(rule.declarations)) {
			if (!/^border-.*radius$/.test(property)) continue;
			const resolved = value.replace(/var\((--[\w-]+)\)/g, (_, name: string) => tokens[name]);
			if (!/^0(?:px)?$/.test(resolved)) violations.push(`${rule.prelude}: ${property}: ${value}`);
		}
	}
	expect(violations).toEqual([]);
});
