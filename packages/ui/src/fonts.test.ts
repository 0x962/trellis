import { describe, expect, test } from "bun:test";
import { blocks, findBlock, parseCss, readSource } from "../test/css";

const fonts = async () => parseCss(await readSource("fonts.css"));

// The three entries the mono stack starts with, in order.
const monoHead = ['"BerkeleyMono"', '"JetBrains Mono"', '"JetBrains Mono Fallback"'];

// The two entries the sans stack starts with, in order.
const sansHead = ['"Inter Variable"', '"Inter Fallback"'];

describe("fonts.css", () => {
	// The mono stack carries the ticket identifiers and the code blocks. A
	// bold heading that holds inline code asks for 600, so the stylesheet
	// declares 400, 500, and 600.
	test("fonts.css declares the latin JetBrains Mono WOFF2 files for weights 400, 500, and 600", async () => {
		const pieces = await fonts();
		const mono = blocks(pieces)
			.filter((piece) => piece.prelude === "@font-face")
			.map((piece) => piece.declarations)
			.filter((face) => face["font-family"] === '"JetBrains Mono"');
		expect(mono.map((face) => face["font-weight"])).toEqual(["400", "500", "600"]);
		for (const face of mono) {
			expect(face.src).toContain("@fontsource/jetbrains-mono/files/jetbrains-mono-latin-");
			expect(face.src).toEndWith('.woff2") format("woff2")');
			expect(face.src).not.toContain('.woff")');
		}
	});

	// Inter is a variable font, so one file covers weight 100 to 900.
	test("the Inter face is the latin variable file", async () => {
		const faces = blocks(await fonts())
			.filter((piece) => piece.prelude === "@font-face")
			.map((piece) => piece.declarations);
		const inter = faces.find((face) => face["font-family"] === '"Inter Variable"')!;
		expect(inter.src).toContain("@fontsource-variable/inter/files/inter-latin-wght-normal.woff2");
		expect(inter["font-weight"]).toBe("100 900");
		expect(inter["font-display"]).toBe("swap");
		expect(inter["unicode-range"]).toContain("U+0000-00FF");
	});

	// BerkeleyMono is licensed per machine, so the repo ships no file for it
	// and declares no face. A machine with the font installed picks it up
	// from the stack; every other machine falls through to JetBrains Mono.
	test("the stylesheet declares no BerkeleyMono face", async () => {
		const families = blocks(await fonts())
			.filter((piece) => piece.prelude === "@font-face")
			.map((piece) => piece.declarations["font-family"]);
		expect(families).not.toContain('"BerkeleyMono"');
		expect(families.sort()).toEqual(
			[
				'"Inter Fallback"',
				'"Inter Variable"',
				'"JetBrains Mono"',
				'"JetBrains Mono"',
				'"JetBrains Mono"',
				'"JetBrains Mono Fallback"',
			].sort(),
		);
	});

	test("body sets the sans stack and the two Inter features", async () => {
		const body = findBlock(await fonts(), "body");
		expect(body.declarations["font-family"]).toBe("var(--sans)");
		// cv11 is the single-storey a; ss01 opens the digits.
		expect(body.declarations["font-feature-settings"]).toBe('"cv11", "ss01"');
		expect(body.declarations["-webkit-font-smoothing"]).toBe("antialiased");
	});

	test("tabular and mono utilities exist", async () => {
		const pieces = await fonts();
		const tabular = findBlock(pieces, "@utility tabular");
		expect(tabular.declarations["font-variant-numeric"]).toBe("tabular-nums");
		const mono = findBlock(pieces, "@utility mono");
		expect(mono.declarations["font-family"]).toBe("var(--mono)");
		// JetBrains Mono has neither Inter feature, so the marked text drops both.
		expect(mono.declarations["font-feature-settings"]).toBe("normal");
	});

	test("both metric-matched fallback faces exist and each stack leads with its own entries", async () => {
		const faces = blocks(await fonts())
			.filter((piece) => piece.prelude === "@font-face")
			.map((piece) => piece.declarations);
		const sans = faces.find((face) => face["font-family"] === '"Inter Fallback"')!;
		expect(sans.src).toBe("local(Arial)");
		const mono = faces.find((face) => face["font-family"] === '"JetBrains Mono Fallback"')!;
		// Chromium matches local() by the full name or the PostScript name only.
		expect(mono.src).toBe('local("Menlo Regular"), local("Menlo-Regular"), local("SF Mono Regular")');
		for (const face of [sans, mono]) {
			for (const property of ["size-adjust", "ascent-override", "descent-override", "line-gap-override"]) {
				expect(face[property]).toMatch(/^\d+(\.\d+)?%$/);
			}
		}
		const root = findBlock(parseCss(await readSource("tokens.css")), ":root");
		const families = (stack: string) => stack.split(",").map((entry) => entry.trim());
		expect(families(root.declarations["--sans"]!).slice(0, 2)).toEqual(sansHead);
		expect(families(root.declarations["--mono"]!).slice(0, 3)).toEqual(monoHead);
	});

	// The prose reads in Inter and the ticket identifiers read in the mono
	// stack, so no entry of one stack appears in the other.
	test("--sans and --mono share no family", async () => {
		const root = findBlock(parseCss(await readSource("tokens.css")), ":root");
		const families = (stack: string) => new Set(stack.split(",").map((entry) => entry.trim()));
		const sans = families(root.declarations["--sans"]!);
		for (const family of families(root.declarations["--mono"]!)) expect(sans.has(family)).toBe(false);
	});
});
