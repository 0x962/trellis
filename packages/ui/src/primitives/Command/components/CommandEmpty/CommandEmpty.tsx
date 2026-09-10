import type { ReactNode } from "react";

export type CommandEmptyProps = {
	children: ReactNode;
};

// The line a list shows when the query matches nothing.
export function CommandEmpty({ children }: CommandEmptyProps) {
	return <div className="px-2 py-6 text-center text-sm text-fg-muted">{children}</div>;
}
