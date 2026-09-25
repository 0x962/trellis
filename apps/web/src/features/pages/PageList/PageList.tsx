import { Plus } from "@phosphor-icons/react";
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import type { Project } from "@trellis/api";
import { Tooltip, toast } from "@trellis/ui";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { ArchivedBanner } from "../../project-actions";
import { PageTitle } from "../../shell/PageTitle";
import { ProjectBreadcrumb } from "../../shell/ProjectBreadcrumb";
import { ProjectSectionMenu } from "../../shell/ProjectSectionMenu";
import { failureKind } from "../../shell/RouteError";
import { Topbar, TopbarActionButton } from "../../shell/Topbar";
import { CreatePageSheet } from "./components/CreatePageSheet";
import { PageListBody } from "./components/PageListBody";
import { PageListFilters } from "./components/PageListFilters";
import { type PageSearch, pageListInput, pageRows, pageSearchIsFiltered } from "./pageSearch";

export type PageListProps = {
	project: Project;
	search: PageSearch;
	onSearchChange: (next: PageSearch) => void;
};

export function PageList({ project, search, onSearchChange }: PageListProps) {
	const { client, orpc, queryClient } = useApp();
	const [createOpen, setCreateOpen] = useState(false);
	useEffect(() => {
		document.title = `${project.name} Pages · trellis`;
	}, [project.name]);
	const options = orpc.pages.list.infiniteOptions({
		input: (cursor: string | undefined) => pageListInput(project.key, search, cursor),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (page) => page.nextCursor ?? undefined,
	});
	const query = useInfiniteQuery(options);
	const pages = useMemo(() => pageRows(query.data), [query.data]);
	const failed = query.data === undefined && query.failureCount > 0;
	const pin = useMutation({
		mutationFn: (page: (typeof pages)[number]) => client.pages.pin({ page: page.ref, pinned: !page.pinned }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.pages.key() }),
		onError: (error) => toast.error("The Page pin did not change", { description: error.message }),
	});
	const create = () => setCreateOpen(true);
	const createAction =
		project.archivedAt === null ? (
			<Tooltip content="Create Page">
				<TopbarActionButton label="Create Page" icon={<Plus />} onClick={create} />
			</Tooltip>
		) : undefined;

	return (
		<>
			<Topbar actions={createAction}>
				<PageTitle
					parent={<ProjectBreadcrumb project={project} />}
					title={<ProjectSectionMenu projectKey={project.key} current="pages" />}
				/>
				<PageListFilters projectId={project.id} search={search} onChange={onSearchChange} />
			</Topbar>
			<div className="page-card flex flex-1 flex-col overflow-hidden">
				{project.archivedAt !== null && <ArchivedBanner project={project} />}
				<div className="min-h-0 flex-1 overflow-y-auto">
					<PageListBody
						projectKey={project.key}
						pages={pages}
						pending={query.isPending && !failed}
						error={failed || query.isError ? query.error : null}
						offline={query.error !== null && failureKind(query.error) === "offline"}
						filtered={pageSearchIsFiltered(search)}
						archived={project.archivedAt !== null}
						hasMore={query.hasNextPage}
						loadingMore={query.isFetchingNextPage}
						pinningId={pin.isPending ? (pin.variables?.id ?? null) : null}
						onRetry={() => void queryClient.resetQueries({ queryKey: options.queryKey, exact: true })}
						onCreate={create}
						onLoadMore={() => void query.fetchNextPage()}
						onPin={(page) => pin.mutate(page)}
					/>
				</div>
			</div>
			{createOpen && (
				<CreatePageSheet projectId={project.id} projectKey={project.key} onClose={() => setCreateOpen(false)} />
			)}
		</>
	);
}
