/*
 * The recipe that makes the project colors.
 *
 * `tokens.css` holds the hex value of every project color, and this file holds
 * the numbers those values come from. `projectColors.test.ts` runs the recipe
 * again and compares it to the file, so a hand-written hex value fails the
 * test.
 *
 * The 25 colors sit on one circle of hues, one step apart. Each role below
 * fixes one OKLCH lightness for all 25, and a color takes the largest chroma
 * that lightness and that hue still show, up to the chroma cap of the role.
 * One fixed lightness is what makes 25 hues read as one family: no color is
 * heavier or lighter than its neighbour. The chroma has to bend, because sRGB
 * holds far more chroma at some hues (magenta) than at others (cyan), and one
 * chroma for every hue pulls the whole set down to the weakest hue. The cap
 * holds the other end, where sRGB is generous and one hue would shout over its
 * neighbours.
 */

import { projectColors } from "./projectColors";

// Where the hues start, and how far apart they sit. 25 colors over the whole
// circle give a step of 14.4 degrees. The start turns the circle so that each
// of the 25 lands near a hue a person has an ordinary word for, which
// `projectColorLabels` in `projectColors.ts` holds.
export const hueStart = 8;
export const hueStep = 14.4;

// The OKLCH lightness of each role. `solid` fills the ground of the project
// mark and writes the key of the project. `soft` is the ground of the key
// chip, and the key is the `solid` value on top of it.
export const roleLightness = {
	lightSolid: 0.5,
	lightSoft: 0.965,
	darkSolid: 0.78,
	darkSoft: 0.27,
} as const;

// The largest chroma each role takes. sRGB is far more generous at some hues
// than at others, so without a cap one hue shouts over the other 24. At the
// lightness of a solid value it shows a violet at three times the chroma of a
// teal. At the lightness of a light soft value it shows a yellow at five times
// the chroma of a blue, which makes one key chip a neon field beside 24 pale
// washes.
export const roleChromaCap = {
	lightSolid: 0.21,
	lightSoft: 0.045,
	darkSolid: 0.15,
	darkSoft: 0.08,
} as const;

// The hue of the color at this place in the list.
export const hueAt = (index: number) => (hueStart + index * hueStep) % 360;

// OKLab to linear sRGB, then linear sRGB to sRGB: the matrices and the
// transfer function of CSS Color 4.
const oklabToLinear = (lightness: number, a: number, b: number) => {
	const long = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const medium = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const short = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
	return [
		4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
		-1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
		-0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short,
	];
};

const toSrgb = (value: number) => (value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055);

// The color at one lightness, one hue and one chroma.
const swatch = (lightness: number, chroma: number, hue: number) => {
	const radians = (hue * Math.PI) / 180;
	return oklabToLinear(lightness, chroma * Math.cos(radians), chroma * Math.sin(radians)).map(toSrgb);
};

// A color sRGB can show. The tolerance covers the rounding of the matrices: a
// channel a hair outside 0 or 1 still rounds to a hex value that reads back as
// the same color.
const showable = (parts: readonly number[]) => parts.every((part) => part >= -0.0005 && part <= 1.0005);

const hexOf = (parts: readonly number[]) =>
	`#${parts
		.map((part) => Math.round(Math.min(1, Math.max(0, part)) * 255))
		.map((part) => part.toString(16).padStart(2, "0").toUpperCase())
		.join("")}`;

// The color at this lightness and hue, at the largest chroma sRGB shows up to
// `cap`. The search halves the span 40 times, which settles far below one step
// of a hex digit.
export const rampValue = (lightness: number, hue: number, cap: number) => {
	let low = 0;
	let high = cap;
	for (let step = 0; step < 40; step++) {
		const middle = (low + high) / 2;
		if (showable(swatch(lightness, middle, hue))) low = middle;
		else high = middle;
	}
	return hexOf(swatch(lightness, low, hue));
};

// The two values of one color in one theme, in the order `tokens.css` writes
// them.
export const rampAt = (index: number, theme: "light" | "dark") => {
	const hue = hueAt(index);
	const light = theme === "light";
	return {
		solid: rampValue(
			light ? roleLightness.lightSolid : roleLightness.darkSolid,
			hue,
			light ? roleChromaCap.lightSolid : roleChromaCap.darkSolid,
		),
		soft: rampValue(
			light ? roleLightness.lightSoft : roleLightness.darkSoft,
			hue,
			light ? roleChromaCap.lightSoft : roleChromaCap.darkSoft,
		),
	};
};

// The `tokens.css` lines of one theme, in the order that file writes them.
export const tokenLines = (theme: "light" | "dark") =>
	projectColors
		.map((name, index) => {
			const { solid, soft } = rampAt(index, theme);
			return [`\t--project-${name}-solid: ${solid};`, `\t--project-${name}-soft: ${soft};`].join("\n");
		})
		.join("\n");

// The `project-color.css` rules that bind one name to its two values.
export const bindingLines = () =>
	projectColors
		.map((name) =>
			[
				`[data-project-color="${name}"] {`,
				`\t--project-solid: var(--project-${name}-solid);`,
				`\t--project-soft: var(--project-${name}-soft);`,
				"}",
			].join("\n"),
		)
		.join("\n");

// Print every line the two CSS files need. Run this after a color goes on the
// end of `projectColors`, and paste each block over the block it replaces:
// `bun packages/ui/src/domain/projectPalette.ts`. `tokens.css` carries the
// dark block twice, once under the media query and once under the theme
// attribute, and both copies take the same lines.
if (import.meta.main) {
	console.log(`/* tokens.css, the :root block */\n${tokenLines("light")}`);
	console.log(`\n/* tokens.css, both dark blocks */\n${tokenLines("dark")}`);
	console.log(`\n/* project-color.css */\n${bindingLines()}`);
}
