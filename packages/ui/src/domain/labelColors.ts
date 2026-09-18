// The hue names a ticket label can take. `tokens.css` holds one `--label-<hue>`
// value per name for each theme.
export type LabelColor = "gray" | "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "purple" | "pink";

// Every hue, in the order a color field lists them.
export const labelColors: readonly LabelColor[] = [
	"gray",
	"red",
	"orange",
	"yellow",
	"green",
	"teal",
	"blue",
	"purple",
	"pink",
];
