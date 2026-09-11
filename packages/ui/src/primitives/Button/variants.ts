export type ButtonVariant = "primary" | "default" | "quiet" | "danger" | "danger-soft";

// The fill, border, and text of each variant, shared by Button and
// IconButton. A hover changes color only, and only on an enabled control,
// so a disabled control never lights up under the pointer.
export const buttonVariants: Record<ButtonVariant, string> = {
	default: "bg-surface border-border text-fg enabled:hover:bg-bg enabled:hover:border-border-strong",
	primary: "bg-surface border-border-strong text-fg enabled:hover:bg-elevated enabled:hover:border-fg-muted",
	quiet: "bg-transparent border-transparent text-fg-muted enabled:hover:bg-bg enabled:hover:text-fg",
	danger: "bg-danger border-danger text-on-accent enabled:hover:brightness-105",
	"danger-soft": "bg-surface border-border text-danger enabled:hover:bg-danger-soft enabled:hover:border-danger",
};

// Disabled primary and danger controls use a faint label and a quiet border.
export const disabledLook = (variant: ButtonVariant) =>
	variant === "primary" || variant === "danger"
		? "disabled:bg-surface disabled:border-border disabled:text-fg-faint"
		: "disabled:opacity-50";
