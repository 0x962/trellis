export type ButtonVariant = "primary" | "default" | "quiet" | "danger" | "danger-soft";

// The fill, border, and text of each variant, shared by Button and
// IconButton. A hover changes color only, and only on an enabled control,
// so a disabled control never lights up under the pointer.
export const buttonVariants: Record<ButtonVariant, string> = {
	default: "bg-surface border-border text-fg enabled:hover:bg-bg enabled:hover:border-border-strong",
	primary: "bg-accent border-accent text-on-accent enabled:hover:brightness-105",
	quiet: "bg-transparent border-transparent text-fg-muted enabled:hover:bg-bg enabled:hover:text-fg",
	danger: "bg-danger border-danger text-on-accent enabled:hover:brightness-105",
	"danger-soft": "bg-surface border-border text-danger enabled:hover:bg-danger-soft enabled:hover:border-danger",
};

// A disabled fill must not read as an action. Primary and danger drop
// their fill for the quiet surface; the other variants fade.
export const disabledLook = (variant: ButtonVariant) =>
	variant === "primary" || variant === "danger"
		? "disabled:bg-surface disabled:border-border disabled:text-fg-faint"
		: "disabled:opacity-50";
