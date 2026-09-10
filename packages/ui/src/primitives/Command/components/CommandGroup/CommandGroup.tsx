import { Command as Cmdk } from "cmdk";
import type { ReactNode } from "react";

export type CommandGroupProps = {
	// The section name. cmdk names the option list with it, so a screen
	// reader hears which section an option belongs to.
	heading: ReactNode;
	children: ReactNode;
};

// One titled section of a Command list.
export function CommandGroup({ heading, children }: CommandGroupProps) {
	return (
		<Cmdk.Group
			heading={heading}
			className="mb-1 last:mb-0 [&_[cmdk-group-heading]]:flex [&_[cmdk-group-heading]]:h-7 [&_[cmdk-group-heading]]:items-center [&_[cmdk-group-heading]]:gap-1.5 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-sm [&_[cmdk-group-heading]]:text-fg-faint"
		>
			{children}
		</Cmdk.Group>
	);
}
