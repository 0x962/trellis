import { expect, test } from "bun:test";
import { projectColorLabels, projectColors } from "./projectColors";
import { rampAt } from "./projectPalette";

const css = await Bun.file(new URL("../tokens.css", import.meta.url)).text();
const bindingCss = await Bun.file(new URL("../project-room.css", import.meta.url)).text();

// The bar of WCAG 1.4.11 for a graphical object, and the bar of 1.4.3 for
// text.
const graphicBar = 3;
const textBar = 4.5;

// The blocks of tokens.css: the bare `:root` holds the light palette, and
// `:root[data-theme="dark"]` holds the dark one. The media block above it
// repeats the dark values, and the test below compares the two. This reader
// takes the hex values of a block and drops a value written as a `var()`,
// because no project token is written that way.
const block = (selector: string) => {
	const start = css.indexOf(selector);
	const body = css.slice(start, css.indexOf("\n}", start));
	const values = new Map<string, string>();
	for (const match of body.matchAll(/(--[a-z0-9-]+): (#[0-9A-Fa-f]{6});/g)) {
		const [, name, value] = match as unknown as [string, string, string];
		values.set(name, value);
	}
	return values;
};
const themes = {
	light: block(":root {"),
	dark: block(':root[data-theme="dark"] {'),
};
const mediaDark = block(':root:not([data-theme="light"]) {');

const rgb = (hex: string) => [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));

const channel = (value: number) => {
	const part = value / 255;
	return part <= 0.04045 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string) => {
	const [red, green, blue] = rgb(hex).map(channel) as [number, number, number];
	return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

const ratio = (one: string, two: string) => {
	const [high, low] = [luminance(one), luminance(two)].sort((a, b) => b - a) as [number, number];
	return (high + 0.05) / (low + 0.05);
};

test("the list holds 25 names, each one once, and each one with a label", () => {
	expect(projectColors).toHaveLength(25);
	expect(new Set(projectColors).size).toBe(25);
	for (const color of projectColors) {
		expect(projectColorLabels[color]).toBeString();
	}
});

// `projectPalette.ts` is the recipe, and `tokens.css` is its output. A hand
// written value fails here.
test("every value of tokens.css comes from the recipe", () => {
	for (const theme of ["light", "dark"] as const) {
		for (const [index, color] of projectColors.entries()) {
			const ramp = rampAt(index, theme);
			expect(themes[theme].get(`--project-${color}-solid`)).toBe(ramp.solid);
			expect(themes[theme].get(`--project-${color}-soft`)).toBe(ramp.soft);
		}
	}
});

test("every project color holds its two values in both themes", () => {
	for (const color of projectColors) {
		for (const theme of ["light", "dark"] as const) {
			for (const suffix of ["-solid", "-soft"]) {
				expect(themes[theme].get(`--project-${color}${suffix}`)).toMatch(/^#[0-9A-F]{6}$/);
			}
		}
		for (const suffix of ["-solid", "-soft"]) {
			expect(mediaDark.get(`--project-${color}${suffix}`)).toBe(themes.dark.get(`--project-${color}${suffix}`)!);
		}
	}
	expect(themes.light.get("--project-strand")).toBe("#FFFFFF");
	expect(themes.dark.get("--project-strand")).toBe("#0A0A0A");
	expect(mediaDark.get("--project-strand")).toBe("#0A0A0A");
});

// The rule of a name is what puts the two values of that name on a mark or a
// chip, so a name with no rule draws nothing.
test("project-room.css binds every name to its two values", () => {
	for (const color of projectColors) {
		expect(bindingCss).toContain(
			[
				`[data-project-color="${color}"] {`,
				`\t--project-solid: var(--project-${color}-solid);`,
				`\t--project-soft: var(--project-${color}-soft);`,
				"}",
			].join("\n"),
		);
	}
});

// A project color draws the mark of a project and its key chip. Nothing else
// on a page carries it, so these three bars are every place a person meets it.
test("the ground of every project mark reads on the page and on the surface", () => {
	for (const theme of ["light", "dark"] as const) {
		for (const color of projectColors) {
			const solid = themes[theme].get(`--project-${color}-solid`)!;
			expect(ratio(solid, themes[theme].get("--bg")!)).toBeGreaterThanOrEqual(graphicBar);
			expect(ratio(solid, themes[theme].get("--surface")!)).toBeGreaterThanOrEqual(graphicBar);
			expect(ratio(solid, themes[theme].get("--elevated")!)).toBeGreaterThanOrEqual(graphicBar);
		}
	}
});

test("the four strands read on the ground of every project mark", () => {
	for (const theme of ["light", "dark"] as const) {
		const strand = themes[theme].get("--project-strand")!;
		for (const color of projectColors) {
			expect(ratio(strand, themes[theme].get(`--project-${color}-solid`)!)).toBeGreaterThanOrEqual(graphicBar);
		}
	}
});

test("the key of a project reads as text on its own chip", () => {
	for (const theme of ["light", "dark"] as const) {
		for (const color of projectColors) {
			const solid = themes[theme].get(`--project-${color}-solid`)!;
			const soft = themes[theme].get(`--project-${color}-soft`)!;
			expect(ratio(solid, soft)).toBeGreaterThanOrEqual(textBar);
		}
	}
});
