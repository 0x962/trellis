import { Command as Cmdk } from "cmdk";
import type { ReactNode } from "react";

export type CommandListProps = {
	children: ReactNode;
};

// The scrolling option list of a composed Command.
export function CommandList({ children }: CommandListProps) {
	return <Cmdk.List className="max-h-100 overflow-y-auto p-1">{children}</Cmdk.List>;
}
