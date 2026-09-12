export type ButtonVariant = "primary" | "default" | "quiet" | "danger" | "danger-soft";

// The fill, border, and text of each variant, shared by Button and
// IconButton. Every variant has a rest, a hover, and a pressed look. The
// hover and pressed looks apply only to an enabled control, so a disabled
// control never lights up under the pointer.
//
// Primary is the one raised control: brushed silver, which the `metal`
// utility draws. Default and danger-soft sit on the --control ground and
// step through --control-hover and --control-active. Quiet has no ground of
// its own, so it takes a wash of the text color, which reads the same on
// the page, on a surface, and inside a popup.
//
// Solid danger is only for the button that commits a delete inside the
// dialog or popover that confirms it. Every other delete button is
// danger-soft, so a red fill never outranks the primary action on a page.
export const buttonVariants: Record<ButtonVariant, string> = {
	default: "bg-control border-border-strong text-fg enabled:hover:bg-control-hover enabled:active:bg-control-active",
	primary: "metal enabled:hover:brightness-105 enabled:active:metal-pressed",
	quiet:
		"bg-transparent border-transparent text-fg-muted enabled:hover:bg-fg/6 enabled:hover:text-fg enabled:active:bg-fg/10",
	danger: "bg-danger border-danger text-on-accent enabled:hover:brightness-105 enabled:active:brightness-95",
	"danger-soft":
		"bg-control border-border-strong text-danger enabled:hover:bg-danger-soft enabled:hover:border-danger enabled:active:brightness-95",
};

// A toggle that is on: the soft accent fill inside the accent ring. It
// replaces the variant classes while the toggle is on, so the ring shows
// on every variant and the hover keeps the fill.
export const pressedLook = "bg-accent-soft border-accent text-fg enabled:active:brightness-95";

// Every disabled control has one look: a faint label and no hover. A variant
// with a ground also takes the surface and the quiet border. Primary drops
// its gradient and its lit edge too, so a control nobody can press never
// looks raised.
export const disabledLook = (variant: ButtonVariant) =>
	variant === "quiet"
		? "disabled:text-fg-faint"
		: "disabled:bg-none disabled:bg-surface disabled:border-border disabled:text-fg-faint disabled:shadow-none";
