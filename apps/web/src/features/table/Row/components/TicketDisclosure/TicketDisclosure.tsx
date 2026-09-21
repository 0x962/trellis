import { CaretDown, CaretRight } from "@phosphor-icons/react";
import { IconButton, Tooltip } from "@trellis/ui";
import type { TicketDisclosure as TicketDisclosureState } from "../../../utils/flattenGroups";

export type TicketDisclosureProps = {
	identifier: string;
	disclosure: Exclude<TicketDisclosureState, null>;
	onToggle?: () => void;
};

export function TicketDisclosure({ identifier, disclosure, onToggle }: TicketDisclosureProps) {
	const expanded = disclosure === "expanded";
	const label = `${expanded ? "Hide" : "Show"} details for ${identifier}`;
	return (
		<Tooltip content={label}>
			<IconButton
				size="xs"
				label={label}
				icon={expanded ? <CaretDown /> : <CaretRight />}
				aria-expanded={expanded}
				onClick={onToggle}
			/>
		</Tooltip>
	);
}
