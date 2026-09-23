import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { EmptyState, StackedBar, useMediaQuery } from "@trellis/ui";
import { useApp } from "../../../../../lib/appContext";
import { formatCount } from "../../../../../lib/format";

import { pageSheetActions, usePageSheetStore } from "../../../../../stores/pageSheetStore";
import { EpicProgress } from "../../../../epics/EpicPage/components/EpicProgress";
import { epicBarLegend } from "../../../../epics/EpicPage/components/EpicProgress/epicBarLegend";
import { epicProgress, epicSegments } from "../../../../epics/epicBar";
import { epicRunningCount, epicWorkingTicketIds } from "../../../../epics/epicNext";
import { epicPageSearch } from "../../../../epics/epicSearch";
import type { View } from "../../../../filters/grammar";
import { PageSheet } from "../../../PageSheet";
import { PageTitle } from "../../../PageTitle";
import { Topbar } from "../../../Topbar";
import { useShown } from "../../useShown";
import { BrowserSheet } from "../BrowserSheet";

export function EpicStatisticsSheet() {
	const { orpc } = useApp();
	const stats = usePageSheetStore((state) => state.stats);
	const shown = useShown(stats);
	const phone = useMediaQuery("(max-width: 767px)");
	const search = useRouterState({ select: (state) => state.location.search as Partial<View> });
	const epic = useQuery({
		...orpc.epics.get.queryOptions({ input: { epic: shown ?? "" } }),
		enabled: shown !== null,
	});
	const assignedRunsQuery = useQuery({
		...orpc.agentRuns.list.queryOptions({ input: { assigned: true } }),
		enabled: shown !== null,
	});
	const workingTicketIds =
		assignedRunsQuery.status === "success" ? new Set(epicWorkingTicketIds(assignedRunsQuery.data ?? [])) : null;
	const running =
		workingTicketIds !== null && epic.data !== undefined ? epicRunningCount(epic.data, workingTicketIds) : null;
	const tableSearch = epic.data === undefined ? {} : epicPageSearch(search, epic.data.ref, phone);
	const progress = epic.data === undefined ? undefined : epicProgress(epic.data.counts);

	return (
		<PageSheet
			open={stats !== null}
			onClose={pageSheetActions.closeStats}
			onReturn={pageSheetActions.returnToStats}
			title="Statistics"
		>
			<Topbar>
				<PageTitle title="Statistics" />
			</Topbar>
			{shown !== null && epic.isPending && (
				<p role="status" className="p-5 text-sm text-fg-muted">
					Load statistics…
				</p>
			)}
			{shown !== null && epic.isError && (
				<EmptyState variant="page" title="Statistics did not load" description={epic.error.message} />
			)}
			{epic.data !== undefined && progress !== undefined && (
				<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
					<EpicProgress
						epic={epic.data}
						running={running}
						splat={`${epic.data.projectKey}/epics/${epic.data.slug}`}
						search={tableSearch}
						phone={phone}
						workingTicketIds={workingTicketIds}
						onCountClick={pageSheetActions.closeStats}
					/>
					<section
						aria-label={`Tickets of ${epic.data.name} by status`}
						className="flex flex-col gap-3 px-5 py-4 max-md:px-4"
					>
						<div className="flex items-center gap-3">
							<StackedBar
								label={`Tickets of ${epic.data.name} by status`}
								segments={epicSegments(epic.data.counts)}
								size="sm"
								legend={false}
								className="flex-1"
							/>
							<span className="shrink-0 text-sm text-fg-muted tabular">
								{formatCount(progress.done)} of {formatCount(progress.of)} done
							</span>
						</div>
						<p className="text-sm text-fg-faint tabular">{epicBarLegend(epic.data.counts)}</p>
					</section>
				</div>
			)}
			<BrowserSheet at="stats" />
		</PageSheet>
	);
}
