import { describe, expect, test } from "bun:test";
import { join } from "node:path";

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

	// The base layer sets the cursor on every control. It reads no token, but
	// it follows tokens.css so the palette is in place first.
	test("app.css imports the ui base layer after the tokens", async () => {
		const lines = statements(await read());
		const tokens = lines.indexOf('@import "@trellis/ui/tokens.css"');
		const base = lines.indexOf('@import "@trellis/ui/base.css"');
		expect(base).toBeGreaterThan(tokens);
	});

	// The main pane is white in light and the page ground in dark. Bands,
	// wells, and hover take the other one, so a row never paints white on
	// white. Each block has to win on its own, as in tokens.css.
	test("pane and band swap between light and dark in the three palette blocks", async () => {
		const css = (await read()).replace(/\/\*[\s\S]*?\*\//g, "");
		const block = (prelude: string) => {
			const start = css.indexOf(`${prelude} {`);
			expect(start).toBeGreaterThanOrEqual(0);
			return css.slice(start, css.indexOf("}", start));
		};
		const light = block("\n:root");
		expect(light).toContain("--pane: var(--surface)");
		expect(light).toContain("--band: var(--bg)");
		for (const dark of [':root:not([data-theme="light"])', ':root[data-theme="dark"]']) {
			expect(block(dark)).toContain("--pane: var(--bg)");
			expect(block(dark)).toContain("--band: var(--surface)");
		}
		expect(css).toMatch(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\)/);
		expect(css).toContain("--color-pane: var(--pane)");
		expect(css).toContain("--color-band: var(--band)");
	});
});
