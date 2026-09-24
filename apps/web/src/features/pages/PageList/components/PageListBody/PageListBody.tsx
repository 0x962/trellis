import { ArrowDown, PushPinSimple, PushPinSlash } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { PageSummary } from "@trellis/api";
import { Button, EmptyState, FailureState, IconButton, PageRow, Tooltip } from "@trellis/ui";
import { compactRelativeTime } from "../../../../../lib/format";
import { PageListSkeleton } from "../PageListSkeleton";

export type PageListBodyProps = {
	projectKey: string;
	pages: readonly PageSummary[];
	pending: boolean;
	error: unknown;
	offline: boolean;
	filtered: boolean;
	archived: boolean;
	hasMore: boolean;
	loadingMore: boolean;
	pinningId: string | null;
	onRetry: () => void;
	onCreate: () => void;
	onLoadMore: () => void;
	onPin: (page: PageSummary) => void;
};

const errorDetail = (error: unknown) =>
	error instanceof Error ? error.message : error === null ? null : String(error);

export function PageListBody({
	projectKey,
	pages,
	pending,
	error,
	offline,
	filtered,
	archived,
	hasMore,
	loadingMore,
	pinningId,
	onRetry,
	onCreate,
	onLoadMore,
	onPin,
}: PageListBodyProps) {
	if (pending) return <PageListSkeleton />;
	if (pages.length === 0 && error !== null) {
		return (
			<FailureState
				variant="page"
				title={offline ? "The server is offline" : "The Pages did not load"}
				description={offline ? "Trellis cannot reach the server." : undefined}
				detail={errorDetail(error)}
				action={
					<Button size="md" onClick={onRetry}>
						Retry
					</Button>
				}
			/>
		);
	}
	if (pages.length === 0) {
		return filtered ? (
			<EmptyState variant="page" title="No Pages match" description="Change the search or remove a filter." />
		) : (
			<EmptyState
				variant="page"
				title="No Pages yet"
				description="An agent publishes an HTML artifact as a Page."
				action={
					archived ? undefined : (
						<Button variant="primary" size="md" onClick={onCreate}>
							Create Page
						</Button>
					)
				}
			/>
		);
	}
	return (
		<>
			{error !== null && (
				<FailureState
					variant="section"
					className="px-5 max-md:px-4"
					title={offline ? "The server is offline" : "The Pages did not refresh"}
					detail={errorDetail(error)}
					action={
						<Button size="md" onClick={onRetry}>
							Retry
						</Button>
					}
				/>
			)}
			<ul aria-label="Pages">
				{pages.map((page) => (
					<PageRow
						key={page.id}
						title={page.title}
						summary={page.summary}
						latestVersion={page.latestVersion}
						publishedBy={page.publishedBy.displayName ?? page.publishedBy.name}
						publishedAt={page.publishedAt}
						age={compactRelativeTime(page.publishedAt)}
						watcher={page.watcher?.agent.name ?? null}
						openThreadCount={page.openThreadCount}
						pinned={page.pinned}
						deleted={page.deletedAt !== null}
						link={<Link to="/p/$" params={{ _splat: `${projectKey}/pages/${page.slug}` }} search={{}} />}
						actions={[
							{
								label: page.pinned ? "Unpin" : "Pin",
								icon: page.pinned ? <PushPinSlash /> : <PushPinSimple />,
								disabled: archived || pinningId !== null,
								onSelect: () => onPin(page),
							},
						]}
					/>
				))}
			</ul>
			{hasMore && (
				<div className="flex justify-center py-2">
					<Tooltip content="Load more Pages">
						<IconButton label="Load more Pages" icon={<ArrowDown />} disabled={loadingMore} onClick={onLoadMore} />
					</Tooltip>
				</div>
			)}
		</>
	);
}
