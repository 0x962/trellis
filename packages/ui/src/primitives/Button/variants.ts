export type ButtonVariant = "primary" | "default" | "quiet" | "danger" | "danger-soft";

// The fill, border, and text of each variant, shared by Button and
// IconButton. A hover changes color only, and only on an enabled control,
// so a disabled control never lights up under the pointer. Primary is the
// one raised control: brushed silver, which the `metal` utility draws.
export const buttonVariants: Record<ButtonVariant, string> = {
	default: "bg-surface border-border text-fg enabled:hover:bg-bg enabled:hover:border-border-strong",
	primary: "metal enabled:hover:brightness-105 enabled:active:metal-pressed",
	quiet: "bg-transparent border-transparent text-fg-muted enabled:hover:bg-bg enabled:hover:text-fg",
	danger: "bg-danger border-danger text-on-accent enabled:hover:brightness-105",
	"danger-soft": "bg-surface border-border text-danger enabled:hover:bg-danger-soft enabled:hover:border-danger",
};

// A disabled primary or danger control takes a faint label and a quiet
// border. Primary drops its gradient and its lit edge too, so a control
// nobody can press never looks raised.
export const disabledLook = (variant: ButtonVariant) =>
	variant === "primary" || variant === "danger"
		? "disabled:bg-none disabled:bg-surface disabled:border-border disabled:text-fg-faint disabled:shadow-none"
		: "disabled:opacity-50";
