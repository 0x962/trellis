export type ButtonVariant = "primary" | "default" | "quiet" | "danger" | "danger-soft";

// The fill, border, and text of each variant, shared by Button and
// IconButton. Every variant has a rest, a hover, and a pressed look. The
// hover and pressed looks apply only to an enabled control, so a disabled
// control never lights up under the pointer. `control-on` and `control-off`
// are the variants of `tokens.css`. A control with `focusableWhenDisabled`
// carries `aria-disabled` and no `disabled` attribute, so it keeps the
// keyboard focus for its Tooltip, and `control-off` matches both.
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
	default:
		"bg-control border-border-strong text-fg control-on:hover:bg-control-hover control-on:active:bg-control-active",
	primary: "metal control-on:hover:brightness-105 control-on:active:metal-pressed",
	quiet:
		"bg-transparent border-transparent text-fg-muted control-on:hover:bg-fg/6 control-on:hover:text-fg control-on:active:bg-fg/10",
	danger: "bg-danger border-danger text-on-accent control-on:hover:brightness-105 control-on:active:brightness-95",
	"danger-soft":
		"bg-control border-border-strong text-danger control-on:hover:bg-danger-soft control-on:hover:border-danger control-on:active:brightness-95",
};

// A toggle that is on: the soft accent fill inside the accent ring. It
// replaces the variant classes while the toggle is on, so the ring shows
// on every variant and the hover keeps the fill.
export const pressedLook = "bg-accent-soft border-accent text-fg control-on:active:brightness-95";

export const disabledLook = (variant: ButtonVariant) =>
	variant === "quiet"
		? "control-off:text-fg-faint"
		: "control-off:bg-none control-off:bg-surface control-off:border-border control-off:text-fg-faint control-off:shadow-none";
