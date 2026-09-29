import { ArrowClockwise } from "@phosphor-icons/react";
import type { UsageDays } from "@trellis/api";
import { Segmented, Tooltip } from "@trellis/ui";
import { TopbarActionButton } from "../../../../shell/Topbar";
import { useUsageReport } from "../../hooks/useUsageReport";

const rangeOptions = [
	{ value: "7", label: "7d" },
	{ value: "30", label: "30d" },
	{ value: "90", label: "90d" },
] as const;

export function AgentUsageControls() {
	const { days, setDays, report, refresh } = useUsageReport();
	return (
		<>
			<Segmented
				label="Range"
				options={rangeOptions}
				value={String(days) as "7" | "30" | "90"}
				onValueChange={(value) => setDays(Number(value) as UsageDays)}
			/>
			<Tooltip content="Scan the transcripts again">
				<TopbarActionButton
					label="Refresh usage"
					icon={<ArrowClockwise />}
					processing={refresh.isPending || report.isFetching}
					onClick={() => refresh.mutate()}
				/>
			</Tooltip>
		</>
	);
}
