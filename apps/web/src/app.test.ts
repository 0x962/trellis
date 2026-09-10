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
});
