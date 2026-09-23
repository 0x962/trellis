// The color names a project can hold. `tokens.css` holds one
// `--project-<name>` value, one `--project-<name>-tint` value, and one
// `--project-<name>-soft` value per name for each theme. The list is the
// option list of `ProjectColorSchema` in @trellis/api: packages/ui never
// imports the api, so the two lists stand side by side, and
// `projectColors.test.ts` in apps/web compares them.
export type ProjectColor = "orange" | "teal" | "blue" | "pink" | "azure";

// Every color, in the order a color field lists them.
export const projectColors: readonly ProjectColor[] = ["orange", "teal", "blue", "pink", "azure"];

// The word a color field shows for each color.
export const projectColorNames: Record<ProjectColor, string> = {
	orange: "Orange",
	teal: "Teal",
	blue: "Blue",
	pink: "Pink",
	azure: "Azure",
};

// The colors a person can still pick for one project: every color that no
// other project holds, and the color this project already holds. Two
// projects never hold one color, so the five names are five slots.
export const freeProjectColors = (taken: readonly ProjectColor[], own: ProjectColor | null): ProjectColor[] =>
	projectColors.filter((color) => color === own || !taken.includes(color));
