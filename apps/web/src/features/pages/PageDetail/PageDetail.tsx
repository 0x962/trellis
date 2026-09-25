import { ArrowClockwise } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { Project } from "@trellis/api";
import { FailureState, IconButton, Spinner, Tooltip } from "@trellis/ui";
import { useApp } from "../../../lib/appContext";
import { PageTitle } from "../../shell/PageTitle";
import { failureKind } from "../../shell/RouteError";
import { Topbar } from "../../shell/Topbar";
import { PageLoaded } from "./components/PageLoaded";
import type { PageDetailSearch } from "./pageLocation";

export function PageDetail({ project, slug, search }: { project: Project; slug: string; search: PageDetailSearch }) {
	const { orpc } = useApp();
	const query = useQuery({
		...orpc.pages.get.queryOptions({
			input: { page: `${project.key}/pages/${slug}`, version: search.version, includeDeleted: true },
		}),
		retry: false,
	});
	if (query.data !== undefined)
		return (
			<PageLoaded
				page={query.data}
				project={project}
				historical={search.version !== undefined}
				offline={query.error !== null && failureKind(query.error) === "offline"}
			/>
		);
	return (
		<>
			<Topbar>
				<PageTitle title="Page" />
			</Topbar>
			<div className="page-card flex min-h-0 flex-1 flex-col overflow-hidden">
				{query.isPending ? (
					<div role="status" className="flex flex-1 items-center justify-center">
						<Spinner />
						<span className="sr-only">Load Page</span>
					</div>
				) : (
					<FailureState
						variant="page"
						title={
							"code" in query.error && query.error.code === "NOT_FOUND"
								? "This Page does not exist"
								: failureKind(query.error) === "refused"
									? "Access to this Page was refused"
									: "The Page did not load"
						}
						detail={query.error.message}
						action={
							<Tooltip content="Retry">
								<IconButton label="Retry" icon={<ArrowClockwise />} onClick={() => void query.refetch()} />
							</Tooltip>
						}
					/>
				)}
			</div>
		</>
	);
}
