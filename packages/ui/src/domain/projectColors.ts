// The color names a project can hold. `tokens.css` holds the three values
// of each name for each theme, and `projectPalette.ts` holds the recipe that
// made those values. The list is the option list of `ProjectColorSchema` in
// @trellis/api: packages/ui never imports the api, so this file and the api
// file each hold the list, and `apps/web/src/lib/projectColors.test.ts`
// compares them.
export type ProjectColor =
	| "red"
	| "brick"
	| "rust"
	| "orange"
	| "amber"
	| "gold"
	| "olive"
	| "moss"
	| "fern"
	| "green"
	| "emerald"
	| "jade"
	| "pine"
	| "teal"
	| "cyan"
	| "azure"
	| "cobalt"
	| "blue"
	| "indigo"
	| "violet"
	| "purple"
	| "orchid"
	| "pink"
	| "rose"
	| "crimson";

// A color field lists the colors in this order, which is the order of the hue
// circle: `projectPalette.ts` gives the color at place `n` the hue
// `hueStart + n * hueStep`. The place of a color never changes, so a color
// never moves under the cursor of a person who is picking one. A color added
// later goes on the end of the list.
export const projectColors: readonly ProjectColor[] = [
	"red",
	"brick",
	"rust",
	"orange",
	"amber",
	"gold",
	"olive",
	"moss",
	"fern",
	"green",
	"emerald",
	"jade",
	"pine",
	"teal",
	"cyan",
	"azure",
	"cobalt",
	"blue",
	"indigo",
	"violet",
	"purple",
	"orchid",
	"pink",
	"rose",
	"crimson",
];

export const projectColorLabels: Record<ProjectColor, string> = {
	red: "Red",
	brick: "Brick",
	rust: "Rust",
	orange: "Orange",
	amber: "Amber",
	gold: "Gold",
	olive: "Olive",
	moss: "Moss",
	fern: "Fern",
	green: "Green",
	emerald: "Emerald",
	jade: "Jade",
	pine: "Pine",
	teal: "Teal",
	cyan: "Cyan",
	azure: "Azure",
	cobalt: "Cobalt",
	blue: "Blue",
	indigo: "Indigo",
	violet: "Violet",
	purple: "Purple",
	orchid: "Orchid",
	pink: "Pink",
	rose: "Rose",
	crimson: "Crimson",
};

// The colors a person can still pick for one project: every color that no
// other project holds, and the color this project already holds. Two
// projects never hold one color, so the names are the slots.
export const freeProjectColors = (taken: readonly ProjectColor[], own: ProjectColor | null): ProjectColor[] =>
	projectColors.filter((color) => color === own || !taken.includes(color));
