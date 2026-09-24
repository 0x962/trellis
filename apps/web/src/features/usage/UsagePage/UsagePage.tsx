import { ArrowClockwise } from "@phosphor-icons/react";
import { useIsFetching, useMutation } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { UsageDays } from "@trellis/api";
import { IconButton, Segmented, Tabs, Tooltip } from "@trellis/ui";
import { useApp } from "../../../lib/appContext";
import { PageTitle } from "../../shell/PageTitle";
import { Topbar } from "../../shell/Topbar";
import { AgentUsage } from "./components/AgentUsage";
import { SystemUsage } from "./components/SystemUsage";

const rangeOptions = [
	{ value: "7", label: "7d" },
	{ value: "30", label: "30d" },
	{ value: "90", label: "90d" },
] as const;

// The range and the Refresh button sit in the Topbar, beside the page
// title, because they govern the whole Agent Usage tab: the cost on every
// account card, the totals, the chart, the breakdown and the session list.
// The System Usage tab reads no range, so the bar carries nothing while it
// shows.
function AgentUsageControls() {
	const { orpc, client, queryClient } = useApp();
	const search = useSearch({ from: "/usage" });
	const navigate = useNavigate({ from: "/usage" });
	const days: UsageDays = search.days ?? 30;
	// AgentUsage holds the report query. The button turns while that query
	// runs, whether this button started the read or the page did.
	const reading = useIsFetching({ queryKey: orpc.usage.report.key() }) > 0;
	const refresh = useMutation({
		mutationFn: () => client.usage.report({ days, refresh: true }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.usage.report.key() }),
	});
	return (
		<>
			<Segmented
				label="Range"
				options={rangeOptions}
				value={String(days) as "7" | "30" | "90"}
				onValueChange={(value) =>
					void navigate({
						search: (previous) => ({
							...previous,
							days: Number(value) as UsageDays,
							row: undefined,
							day: undefined,
						}),
						replace: true,
					})
				}
			/>
			<Tooltip content="Refresh usage">
				<IconButton
					label="Refresh usage"
					icon={<ArrowClockwise />}
					processing={refresh.isPending || reading}
					onClick={() => refresh.mutate()}
				/>
			</Tooltip>
		</>
	);
}

export function UsagePage() {
	const search = useSearch({ from: "/usage" });
	const navigate = useNavigate({ from: "/usage" });
	const tab = search.tab ?? "agent";
	const setTab = (next: "agent" | "system") =>
		void navigate({
			search: (previous) => ({ ...previous, tab: next === "agent" ? undefined : next }),
			resetScroll: false,
		});

	return (
		<>
			<Topbar actions={tab === "agent" ? <AgentUsageControls /> : undefined}>
				<PageTitle title="Usage" />
			</Topbar>
			<div className="page-card flex-1 overflow-y-auto px-8 py-6 max-md:px-4">
				<Tabs
					value={tab}
					onValueChange={setTab}
					panelClassName="pt-5"
					items={[
						{ value: "agent", label: "Agent Usage", content: tab === "agent" ? <AgentUsage /> : null },
						{ value: "system", label: "System Usage", content: tab === "system" ? <SystemUsage /> : null },
					]}
				/>
			</div>
		</>
	);
}
