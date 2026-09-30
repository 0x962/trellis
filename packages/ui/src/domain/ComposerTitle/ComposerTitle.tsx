import type { ComponentProps } from "react";

export function ComposerTitle(props: ComponentProps<"textarea">) {
	return <textarea rows={1} {...props} className="ticket-composer-title" />;
}
