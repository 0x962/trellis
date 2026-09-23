import { useQuery } from "@tanstack/react-query";
import { EmptyState, SectionHeader, Skeleton } from "@trellis/ui";
import { useApp } from "../../../lib/appContext";
import { PageTitle } from "../../shell/PageTitle";
import { Topbar } from "../../shell/Topbar";
import { FaultList } from "./components/FaultList";
import { LoopBlock } from "./components/LoopBlock";
import { sourceWords } from "./components/SourceMark";
import { windowLine } from "./windowLine";

// One system page. Block one lists the work that is broken and that no
// other screen reports. Block two measures the loop between the person and
// the agents over a fixed count of merged pull requests.
export function StatisticsPage() {
	const { orpc } = useApp();
	const statistics = useQuery(orpc.statistics.get.queryOptions({ input: {} }));

	return (
		<>
			<Topbar>
				<PageTitle title="Statistics" />
			</Topbar>
			<div className="page-card flex-1 overflow-y-auto px-8 py-6 max-md:px-4">
				{statistics.isPending && (
					<div role="status" aria-label="Load the statistics">
						<Skeleton className="h-6 w-64" />
						<Skeleton className="mt-3 h-40 w-full" />
					</div>
				)}
				{statistics.isError && (
					<EmptyState variant="page" title="Statistics did not load" description={statistics.error.message} />
				)}
				{statistics.data !== undefined && (
					<div className="flex max-w-7xl flex-col gap-8">
						<section aria-label="Broken, and reported nowhere else">
							<SectionHeader title="Broken, and reported nowhere else" />
							<p className="mt-1 mb-3 max-w-prose text-fg-faint text-xs">
								A held or failed review message reaches the log only. A flow run that stopped is drawn in the Flows tab
								of its own pull request and nowhere else. Each row names the oldest case of its fault.
							</p>
							<FaultList faults={statistics.data.faults} />
						</section>
						<section aria-label="What your reading went into">
							<SectionHeader title="What your reading went into" />
							<p className="mt-1 mb-3 max-w-prose text-fg-faint text-xs">
								{windowLine(statistics.data.loop)} The table names the changes that took the most threads from you.
							</p>
							<LoopBlock loop={statistics.data.loop} />
						</section>
						<section aria-label="Where each figure comes from">
							<SectionHeader title="Where each figure comes from" level={3} />
							<dl className="mt-1 max-w-prose text-fg-faint text-xs">
								{Object.entries(sourceWords).map(([source, sentence]) => (
									<div key={source} className="flex gap-2 py-0.5">
										<dt className="w-12 shrink-0 font-medium text-fg-muted">{source}</dt>
										<dd>{sentence}</dd>
									</div>
								))}
							</dl>
						</section>
					</div>
				)}
			</div>
		</>
	);
}
