import { Command as Cmdk } from "cmdk";
import type { ReactNode } from "react";
import { cx } from "../../../../utils/cx";

export type CommandRootProps = {
	// The accessible name of the search field.
	label?: string;
	// The value of the active option. A caller that owns the active row
	// passes it with `onValueChange`.
	value?: string;
	onValueChange?: (value: string) => void;
	// Off, the list draws every option it is given, in the given order.
	shouldFilter?: boolean;
	children: ReactNode;
	className?: string;
};

// The frame of a composed Command: a field, a list of groups and rows, and
// a footer. `Command` itself is the flat form of the same parts.
export function CommandRoot({
	label = "Search",
	value,
	onValueChange,
	shouldFilter,
	children,
	className,
}: CommandRootProps) {
	return (
		<Cmdk
			label={label}
			value={value}
			onValueChange={onValueChange}
			shouldFilter={shouldFilter}
			className={cx("flex flex-col text-base text-fg", className)}
		>
			{children}
		</Cmdk>
	);
}
