// A tone is a palette color a chart series draws in. Every chart reads its
// colors from the theme tokens through these classes, so a series keeps
// its color in both themes and no chart holds a raw color. `faint` is the
// neutral of a part that has not started, as the Todo status icon draws it.
// It reads 4.5:1 or better on `--elevated`, the ground of a bar, in both
// themes.
export type ChartTone = "agent" | "fg" | "faint" | "success" | "warning" | "danger" | "accent";

// The text color of a tone, for a legend swatch drawn with `bg-current`.
export const chartToneClass: Record<ChartTone, string> = {
	agent: "text-accent",
	fg: "text-fg",
	faint: "text-fg-faint",
	success: "text-success",
	warning: "text-warning",
	danger: "text-danger",
	accent: "text-accent",
};

// The fill of a tone, for an SVG shape or a bar.
export const chartFillClass: Record<ChartTone, string> = {
	agent: "fill-accent",
	fg: "fill-fg",
	faint: "fill-fg-faint",
	success: "fill-success",
	warning: "fill-warning",
	danger: "fill-danger",
	accent: "fill-accent",
};

// The background of a tone, for an HTML bar segment.
export const chartBgClass: Record<ChartTone, string> = {
	agent: "bg-accent",
	fg: "bg-fg",
	faint: "bg-fg-faint",
	success: "bg-success",
	warning: "bg-warning",
	danger: "bg-danger",
	accent: "bg-accent",
};

// The tones of a ranked list, first place first. The slice after the last
// ranked one is "everything else", and it takes the quiet grey of `faint`.
// No ranked tone draws the accent grey, because the light theme draws
// `accent` and `faint` in one grey and the two slices would read as one.
export const rankedTones: readonly ChartTone[] = ["success", "warning", "danger", "fg"];
export const otherTone: ChartTone = "faint";
