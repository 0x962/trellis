/*
 * Each project colour uses one named hue and the same lightness in each role.
 * The chroma cap limits vividness; the sRGB gamut can require a lower chroma.
 * projectColors.test.ts compares this recipe with every value in tokens.css.
 */

import { type ProjectColor, projectColors } from "./projectColors";

export const projectHues: Record<ProjectColor, number> = {
	red: 25,
	orange: 55,
	amber: 95,
	green: 145,
	teal: 195,
	blue: 255,
	violet: 295,
	pink: 335,
};

// The OKLCH lightness of each role. `solid` fills the ground of the project
// mark and writes the key of the project. `soft` is the ground of the key
// chip, and the key is the `solid` value on top of it.
export const roleLightness = {
	lightSolid: 0.5,
	lightSoft: 0.965,
	darkSolid: 0.78,
	darkSoft: 0.27,
} as const;

// The cap limits vividness where sRGB permits more chroma at a hue.
export const roleChromaCap = {
	lightSolid: 0.21,
	lightSoft: 0.045,
	darkSolid: 0.15,
	darkSoft: 0.08,
} as const;

// The hue of the color at this place in the list.
export const hueAt = (index: number) => projectHues[projectColors[index]!];

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

// Run `bun packages/ui/src/domain/projectPalette.ts` after a hue or name changes.
// Copy the output into tokens.css and project-color.css. Both dark blocks use the same values.
if (import.meta.main) {
	console.log(`/* tokens.css, the :root block */\n${tokenLines("light")}`);
	console.log(`\n/* tokens.css, both dark blocks */\n${tokenLines("dark")}`);
	console.log(`\n/* project-color.css */\n${bindingLines()}`);
}
