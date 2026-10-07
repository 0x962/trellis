import type { ComponentProps } from "react";

type Props = ComponentProps<"textarea"> & { variant?: "composer" | "document" };

export function ComposerTitle({ variant = "composer", ...props }: Props) {
	return <textarea rows={1} {...props} data-variant={variant} className="ticket-composer-title" />;
}
