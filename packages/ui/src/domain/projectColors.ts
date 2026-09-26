// The UI and API keep the same ordered colour names without a package dependency.
// apps/web/src/lib/projectColors.test.ts checks that both lists match.
export type ProjectColor = "red" | "orange" | "amber" | "green" | "teal" | "blue" | "violet" | "pink";

export const projectColors: readonly ProjectColor[] = [
	"red",
	"orange",
	"amber",
	"green",
	"teal",
	"blue",
	"violet",
	"pink",
];

export const projectColorLabels: Record<ProjectColor, string> = {
	red: "Red",
	orange: "Orange",
	amber: "Amber",
	green: "Green",
	teal: "Teal",
	blue: "Blue",
	violet: "Violet",
	pink: "Pink",
};

// A project can keep its own colour or take a colour that no other project holds.
export const freeProjectColors = (taken: readonly ProjectColor[], own: ProjectColor | null): ProjectColor[] =>
	projectColors.filter((color) => color === own || !taken.includes(color));
