import { ArrowClockwise } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { Project } from "@trellis/api";
import { FailureState, IconButton, Tooltip } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { PageTitle } from "../../shell/PageTitle";
import { failureKind } from "../../shell/RouteError";
import { Topbar } from "../../shell/Topbar";
import { PageDetailLoading } from "./components/PageDetailLoading";
import { PageDetailView } from "./components/PageDetailView";
import type { PageDetailSearch } from "./pageLink";

export function PageDetail({ project, slug, search }: { project: Project; slug: string; search: PageDetailSearch }) {
	const { orpc } = useApp();
	const [selectedThread, setSelectedThread] = useState<string | null>(null);
	const query = useQuery({
		...orpc.pages.get.queryOptions({
			input: { page: `${project.key}/pages/${slug}`, version: search.version, includeDeleted: true },
		}),
		retry: false,
	});
	if (query.data !== undefined && (query.error === null || failureKind(query.error) === "offline"))
		return (
			<PageDetailView
				page={query.data}
				project={project}
				historical={search.version !== undefined}
				offline={query.error !== null && failureKind(query.error) === "offline"}
				selectedThread={selectedThread}
				onSelectedThreadChange={setSelectedThread}
			/>
		);
	if (query.isPending) return <PageDetailLoading />;
	return (
		<>
			<Topbar>
				<PageTitle title="Page" />
			</Topbar>
			<div className="page-card flex min-h-0 flex-1 flex-col overflow-hidden">
				<FailureState
					variant="page"
					title={
						"code" in query.error! && query.error!.code === "NOT_FOUND"
							? "This Page does not exist"
							: failureKind(query.error) === "refused"
								? "Access to this Page was refused"
								: "The Page did not load"
					}
					detail={query.error!.message}
					action={
						<Tooltip content="Retry">
							<IconButton label="Retry" icon={<ArrowClockwise />} onClick={() => void query.refetch()} />
						</Tooltip>
					}
				/>
			</div>
		</>
	);
}
