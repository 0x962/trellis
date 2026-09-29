import { Command as Cmdk } from "cmdk";
import type { ComponentProps, ReactNode } from "react";

export type CommandListProps = {
	children: ReactNode;
} & Pick<ComponentProps<typeof Cmdk.List>, "ref" | "className" | "style" | "onScroll">;

// The scrolling option list of a composed Command.
export function CommandList({ children, className = "max-h-100", ...props }: CommandListProps) {
	return (
		<Cmdk.List {...props} className={`overflow-y-auto p-1 ${className}`}>
			{children}
		</Cmdk.List>
	);
}
