import { describe, expect, test } from "bun:test";
import { blocks, findBlock, parseCss, readSource, statements } from "../test/css";

const fonts = async () => parseCss(await readSource("fonts.css"));

describe("fonts.css", () => {
	// The fontsource Inter stylesheet declares seven script subsets. Only the
	// latin file is declared here, as a face of our own with the latin
	// unicode-range, so no other subset enters the bundle.
	test("fonts.css imports the latin JetBrains Mono files and declares the latin Inter Variable face", async () => {
		const pieces = await fonts();
		const imports = statements(pieces)
			.filter((piece) => piece.prelude.startsWith("@import"))
			.map((piece) => piece.prelude.match(/["']([^"']+)["']/)![1]!);
		const fontsource = imports.filter((specifier) => specifier.includes("fontsource"));
		expect(fontsource.sort()).toEqual(
			["@fontsource/jetbrains-mono/latin-400.css", "@fontsource/jetbrains-mono/latin-500.css"].sort(),
		);
		const inter = blocks(pieces)
			.filter((piece) => piece.prelude === "@font-face")
			.map((piece) => piece.declarations)
			.find((face) => face["font-family"] === '"Inter Variable"')!;
		expect(inter.src).toBe(
			'url("@fontsource-variable/inter/files/inter-latin-wght-normal.woff2") format("woff2-variations")',
		);
		expect(inter["font-weight"]).toBe("100 900");
		expect(inter["font-display"]).toBe("swap");
		expect(inter["unicode-range"]).toStartWith("U+0000-00FF,");
	});

	test("body sets Inter Variable with cv11 and ss01", async () => {
		const body = findBlock(await fonts(), "body");
		expect(body.declarations["font-family"]).toStartWith('"Inter Variable"');
		expect(body.declarations["font-feature-settings"]).toBe('"cv11", "ss01"');
		expect(body.declarations["-webkit-font-smoothing"]).toBe("antialiased");
	});

	test("tabular and mono utilities exist", async () => {
		const pieces = await fonts();
		const tabular = findBlock(pieces, "@utility tabular");
		expect(tabular.declarations["font-variant-numeric"]).toBe("tabular-nums");
		const mono = findBlock(pieces, "@utility mono");
		expect(mono.declarations["font-family"]).toBe("var(--mono)");
		expect(mono.declarations["font-feature-settings"]).toBe("normal");
	});

	test("metric-matched fallback faces exist and sit in the stacks", async () => {
		const faces = blocks(await fonts())
			.filter((piece) => piece.prelude === "@font-face")
			.map((piece) => piece.declarations);
		const byFamily = (family: string) => faces.find((face) => face["font-family"] === `"${family}"`)!;
		const inter = byFamily("Inter Fallback");
		expect(inter.src).toBe("local(Arial)");
		// Chromium matches local() by the full name or the PostScript name only.
		const mono = byFamily("JetBrains Mono Fallback");
		expect(mono.src).toBe('local("Menlo Regular"), local("Menlo-Regular"), local("SF Mono Regular")');
		for (const face of [inter, mono]) {
			for (const property of ["size-adjust", "ascent-override", "descent-override", "line-gap-override"]) {
				expect(face[property]).toMatch(/^\d+(\.\d+)?%$/);
			}
		}
		const root = findBlock(parseCss(await readSource("tokens.css")), ":root");
		const families = (stack: string) => stack.split(",").map((entry) => entry.trim());
		expect(families(root.declarations["--sans"]!).slice(0, 2)).toEqual(['"Inter Variable"', '"Inter Fallback"']);
		expect(families(root.declarations["--mono"]!).slice(0, 2)).toEqual([
			'"JetBrains Mono"',
			'"JetBrains Mono Fallback"',
		]);
	});
});
