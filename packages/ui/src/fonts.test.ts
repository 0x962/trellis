import { describe, expect, test } from "bun:test";
import { blocks, findBlock, parseCss, readSource, statements } from "../test/css";

const fonts = async () => parseCss(await readSource("fonts.css"));

// The three entries every font stack in this repo starts with, in order.
const head = ['"BerkeleyMono"', '"JetBrains Mono"', '"JetBrains Mono Fallback"'];

describe("fonts.css", () => {
	// The interface, the identifiers, and the code all use one typeface, so
	// the stylesheet declares the three weights the components ask for: 400,
	// 500 through font-medium, and 600 through font-semibold.
	test("fonts.css imports the latin JetBrains Mono files for weights 400, 500, and 600", async () => {
		const pieces = await fonts();
		const imports = statements(pieces)
			.filter((piece) => piece.prelude.startsWith("@import"))
			.map((piece) => piece.prelude.match(/["']([^"']+)["']/)![1]!);
		const fontsource = imports.filter((specifier) => specifier.includes("fontsource"));
		expect(fontsource.sort()).toEqual(
			[
				"@fontsource/jetbrains-mono/latin-400.css",
				"@fontsource/jetbrains-mono/latin-500.css",
				"@fontsource/jetbrains-mono/latin-600.css",
			].sort(),
		);
	});

	// BerkeleyMono is licensed per machine, so the repo ships no file for it
	// and declares no face. A machine with the font installed picks it up
	// from the stack; every other machine falls through to JetBrains Mono.
	test("the only declared face is the JetBrains Mono metric-matched fallback", async () => {
		const faces = blocks(await fonts())
			.filter((piece) => piece.prelude === "@font-face")
			.map((piece) => piece.declarations);
		expect(faces.map((face) => face["font-family"])).toEqual(['"JetBrains Mono Fallback"']);
	});

	test("body sets the mono stack and no OpenType feature", async () => {
		const body = findBlock(await fonts(), "body");
		expect(body.declarations["font-family"]).toStartWith(head.join(", "));
		// cv11 and ss01 are Inter features. JetBrains Mono has neither.
		expect(body.declarations["font-feature-settings"]).toBe("normal");
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

	test("the metric-matched fallback face exists and both stacks lead with the same three entries", async () => {
		const faces = blocks(await fonts())
			.filter((piece) => piece.prelude === "@font-face")
			.map((piece) => piece.declarations);
		const mono = faces.find((face) => face["font-family"] === '"JetBrains Mono Fallback"')!;
		// Chromium matches local() by the full name or the PostScript name only.
		expect(mono.src).toBe('local("Menlo Regular"), local("Menlo-Regular"), local("SF Mono Regular")');
		for (const property of ["size-adjust", "ascent-override", "descent-override", "line-gap-override"]) {
			expect(mono[property]).toMatch(/^\d+(\.\d+)?%$/);
		}
		const root = findBlock(parseCss(await readSource("tokens.css")), ":root");
		const families = (stack: string) => stack.split(",").map((entry) => entry.trim());
		expect(families(root.declarations["--sans"]!).slice(0, 3)).toEqual(head);
		expect(families(root.declarations["--mono"]!).slice(0, 3)).toEqual(head);
	});

	// code.storage sets its whole interface in one typeface, so --sans and
	// --mono hold the same stack. A component keeps its font-mono class and
	// renders the same face as the text around it.
	test("--sans and --mono hold the same stack", async () => {
		const root = findBlock(parseCss(await readSource("tokens.css")), ":root");
		expect(root.declarations["--sans"]).toBe(root.declarations["--mono"]!);
	});
});
