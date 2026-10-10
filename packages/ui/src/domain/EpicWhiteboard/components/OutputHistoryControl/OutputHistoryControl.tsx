import { ArrowClockwise, CaretDown } from "@phosphor-icons/react";
import { IconButton } from "../../../../primitives/IconButton";
import { Tooltip } from "../../../../primitives/Tooltip";
import type { EpicWhiteboardProps } from "../../types";

export function OutputHistoryControl(props: NonNullable<EpicWhiteboardProps["subagentLoad"]>) {
	const label = props.more ? "More outputs" : "Refresh outputs";
	return (
		<div className="absolute right-4 bottom-20 z-10 flex max-w-64 items-center gap-2 rounded-lg border border-border bg-surface p-2 shadow-sm">
			<span className="text-xs text-fg-muted">
				{props.partial
					? "Some output files are unavailable."
					: props.more
						? "More recorded outputs are available."
						: "Recorded outputs"}
			</span>
			<Tooltip content={label}>
				<IconButton
					label={label}
					icon={props.more ? <CaretDown /> : <ArrowClockwise />}
					processing={props.pending}
					onClick={props.load}
				/>
			</Tooltip>
		</div>
	);
}
