import { type ComponentProps, type ReactElement, useRef } from "react";
import { Command } from "../../primitives/Command";
import { Popover } from "../../primitives/Popover";

export type FilterPopoverProps = Pick<
	ComponentProps<typeof Command>,
	"label" | "placeholder" | "items" | "groups" | "onSelect" | "empty"
> & {
	trigger: ReactElement;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	stage?: string;
};
export function FilterPopover({ trigger, open, onOpenChange, stage, ...command }: FilterPopoverProps) {
	const input = useRef<HTMLInputElement>(null);
	return (
		<Popover
			trigger={trigger}
			triggerTooltip="Filter"
			label="Filter"
			open={open}
			onOpenChange={onOpenChange}
			initialFocus={input}
			className="w-72 p-0"
			align="end"
		>
			<Command key={stage} inputRef={input} autoFocus {...command} />
		</Popover>
	);
}
