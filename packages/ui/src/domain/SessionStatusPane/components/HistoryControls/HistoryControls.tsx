import { ArrowClockwise, ArrowDown } from "@phosphor-icons/react";
import { IconButton } from "../../../../primitives/IconButton";
import { Tooltip } from "../../../../primitives/Tooltip";
import { FailureState } from "../../../FailureState";
import type { SessionStatusPaneProps } from "../../types";

export function HistoryControls({ historyControl }: Pick<SessionStatusPaneProps, "historyControl">) {
	return (
		<>
			{historyControl?.error && (
				<FailureState
					variant="section"
					title="The update history did not load"
					action={
						<Tooltip content="Retry history">
							<IconButton
								className="max-md:size-11"
								label="Retry history"
								icon={<ArrowClockwise />}
								onClick={historyControl.retry}
							/>
						</Tooltip>
					}
				/>
			)}
			{historyControl?.hasMore && (
				<Tooltip content="Load older updates">
					<IconButton
						className="max-md:size-11"
						label="Load older updates"
						icon={<ArrowDown />}
						processing={historyControl.loading}
						onClick={historyControl.load}
					/>
				</Tooltip>
			)}
		</>
	);
}
