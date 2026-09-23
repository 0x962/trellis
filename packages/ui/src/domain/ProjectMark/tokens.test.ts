import { expect, test } from "bun:test";
import { projectColors } from "../projectColors";

const css = await Bun.file(new URL("../../tokens.css", import.meta.url)).text();

// The bar of WCAG 1.4.11 for a graphical object, and the bar of 1.4.3 for
// text.
const graphicBar = 3;
const textBar = 4.5;

// The share of the project color that the ground of a project page takes.
// `project-room.css` holds the number, and this test reads it from there.
const roomCss = await Bun.file(new URL("../../project-room.css", import.meta.url)).text();
const tintShare = Number(roomCss.match(/var\(--project-tint\) (\d+)%/)![1]!) / 100;

// The blocks of tokens.css: the bare `:root` holds the light palette, and
// `:root[data-theme="dark"]` holds the dark one. The media block above it
// repeats the dark values, and the test below compares the two.
// A value is a hex value or one `var()` that names another token of the same
// block, such as `--project-teal-tint: var(--label-teal)`. The block resolves
// the link of a project token, and it drops a link of another token, such as
// `--shadow-lg`, which names a value this test never reads.
const block = (selector: string) => {
	const start = css.indexOf(selector);
	const body = css.slice(start, css.indexOf("\n}", start));
	const values = new Map<string, string>();
	const links = new Map<string, string>();
	for (const match of body.matchAll(/(--[a-z0-9-]+): (#[0-9A-Fa-f]{6}|var\(--[a-z0-9-]+\));/g)) {
		const [, name, value] = match as unknown as [string, string, string];
		if (value.startsWith("#")) values.set(name, value);
		else if (name.startsWith("--project-")) links.set(name, value.slice("var(".length, -1));
	}
	for (const [name, target] of links) {
		const value = values.get(target);
		expect(value, `${name} reads ${target}, which holds no value in this block`).toBeString();
		values.set(name, value!);
	}
	return values;
};
const themes = {
	light: block(":root {"),
	dark: block(':root[data-theme="dark"] {'),
};
const mediaDark = block(':root:not([data-theme="light"]) {');

// The silver face of the dot that says a ticket waits for a person is one
// set for both themes, so it stands outside the two palette blocks.
const onlyValue = (name: string) => {
	const found = [...css.matchAll(new RegExp(`${name}: (#[0-9A-Fa-f]{6});`, "g"))];
	expect(found).toHaveLength(1);
	return found[0]![1]!;
};

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

// `color-mix(in srgb, <tint> <share>, <ground>)`, as the browser computes it.
const mix = (tint: string, ground: string, share: number) => {
	const parts = rgb(tint).map((value, index) => Math.round(value * share + rgb(ground)[index]! * (1 - share)));
	return `#${parts.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
};

// The color of a status glyph, and the face of the silver dot that says a
// ticket waits for a person.
const statusTokens = ["--success", "--warning", "--danger", "--agent", "--metal-bottom"];

const statusValue = (theme: "light" | "dark", name: string) => themes[theme].get(name) ?? onlyValue(name);

test("every project color holds its three values in both themes", () => {
	for (const color of projectColors) {
		for (const theme of ["light", "dark"] as const) {
			for (const suffix of ["-solid", "-tint", "-soft"]) {
				expect(themes[theme].get(`--project-${color}${suffix}`)).toMatch(/^#[0-9A-F]{6}$/);
			}
		}
		expect(mediaDark.get(`--project-${color}-solid`)).toBe(themes.dark.get(`--project-${color}-solid`)!);
		expect(mediaDark.get(`--project-${color}-soft`)).toBe(themes.dark.get(`--project-${color}-soft`)!);
	}
	expect(themes.light.get("--project-strand")).toBe("#FFFFFF");
	expect(themes.dark.get("--project-strand")).toBe("#0A0A0A");
	expect(mediaDark.get("--project-strand")).toBe("#0A0A0A");
});

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

// The ground of a project page is the pane with a share of the project color
// mixed in. The light pane is `--surface` and the dark pane is `--bg`, which
// is what `--pane` resolves to in each theme.
test("every status glyph still reads on the ground of every project", () => {
	for (const theme of ["light", "dark"] as const) {
		const pane = theme === "light" ? themes.light.get("--surface")! : themes.dark.get("--bg")!;
		for (const color of projectColors) {
			const room = mix(themes[theme].get(`--project-${color}-tint`)!, pane, tintShare);
			for (const token of statusTokens) {
				const status = statusValue(theme, token);
				if (token !== "--metal-bottom") {
					expect(ratio(status, room)).toBeGreaterThanOrEqual(graphicBar);
				}
				// The tint costs a status glyph a part of its contrast. The
				// sample that Navid picked measured the same part for every
				// status, so no status starts to look like another.
				const cost = 1 - ratio(status, room) / ratio(status, pane);
				expect(Math.abs(cost)).toBeLessThan(0.1);
			}
		}
	}
});
