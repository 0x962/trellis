import { ArrowClockwise } from "@phosphor-icons/react";
import { Tooltip } from "@trellis/ui";
import { TopbarActionButton } from "../../../../shell/Topbar";
import { useUsageReport } from "../../hooks/useUsageReport";

export function AgentUsageControls() {
	const { report, refresh } = useUsageReport();
	return (
		<Tooltip content="Scan the transcripts again">
			<TopbarActionButton
				label="Refresh usage"
				icon={<ArrowClockwise />}
				processing={refresh.isPending || report.isFetching}
				onClick={() => refresh.mutate()}
			/>
		</Tooltip>
	);
}
