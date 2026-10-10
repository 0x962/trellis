import { expect, test } from "bun:test";

const css = await Bun.file(new URL("./flowCanvas.css", import.meta.url)).text();
const tokens = await Bun.file(new URL("./tokens.css", import.meta.url)).text();
const ring = css.slice(
	css.indexOf(".flow-canvas .react-flow__handle::after {"),
	css.indexOf("\n}", css.indexOf(".flow-canvas .react-flow__handle::after {")),
);
const ringToken = ring.match(/border: [^;]*solid var\((--[a-z-]+)\)/)![1]!;

const luminance = (hex: string) =>
	[1, 3, 5].reduce((sum, offset, index) => {
		const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
		const linear = channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
		return sum + linear * [0.2126, 0.7152, 0.0722][index]!;
	}, 0);

test("the neutral connection ring uses the shared foreground token", () => {
	expect(ringToken).toBe("--fg-faint");
});

for (const selector of [":root {", ':root:not([data-theme="light"]) {', ':root[data-theme="dark"] {']) {
	test(`the neutral connection ring reaches 3:1 against each adjacent surface in ${selector}`, () => {
		const start = tokens.indexOf(selector);
		const block = tokens.slice(start, tokens.indexOf("\n}", start));
		const colors = new Map(
			[...block.matchAll(/(--[a-z-]+): (#[0-9A-Fa-f]{6});/g)].map((match) => [match[1]!, match[2]!]),
		);
		const foreground = luminance(colors.get(ringToken)!);
		for (const surface of ["--bg", "--surface", "--elevated"]) {
			const background = luminance(colors.get(surface)!);
			expect(
				(Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05),
			).toBeGreaterThanOrEqual(3);
		}
	});
}
