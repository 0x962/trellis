// A tone is a palette color a chart series draws in. Every chart reads its
// colors from the theme tokens through these classes, so a series keeps
// its color in both themes and no chart holds a raw color.
export type ChartTone = "agent" | "fg" | "success" | "warning" | "danger" | "accent";

// The text color of a tone, for a legend swatch drawn with `bg-current`.
export const chartToneClass: Record<ChartTone, string> = {
	agent: "text-agent",
	fg: "text-fg",
	success: "text-success",
	warning: "text-warning",
	danger: "text-danger",
	accent: "text-accent",
};

// The fill of a tone, for an SVG shape or a bar.
export const chartFillClass: Record<ChartTone, string> = {
	agent: "fill-agent",
	fg: "fill-fg",
	success: "fill-success",
	warning: "fill-warning",
	danger: "fill-danger",
	accent: "fill-accent",
};

// The background of a tone, for an HTML bar segment.
export const chartBgClass: Record<ChartTone, string> = {
	agent: "bg-agent",
	fg: "bg-fg",
	success: "bg-success",
	warning: "bg-warning",
	danger: "bg-danger",
	accent: "bg-accent",
};

// The tones of a ranked list, first place first. The sixth slice of a
// chart is "everything else", and it takes the quiet accent grey.
export const rankedTones: readonly ChartTone[] = ["agent", "success", "warning", "danger", "fg"];
export const otherTone: ChartTone = "accent";
