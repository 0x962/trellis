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
