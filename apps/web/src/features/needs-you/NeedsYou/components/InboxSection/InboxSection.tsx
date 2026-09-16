import { ArrowCounterClockwise, ArrowDown, Clock, EyeSlash } from "@phosphor-icons/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { NeedsYouListInput } from "@trellis/api";
import { EmptyState, IconButton, InboxRow, SectionHeader, Skeleton, StatusIcon, Tooltip } from "@trellis/ui";
import { useActor } from "../../../../../lib/actor";
import { useApp } from "../../../../../lib/appContext";
import { compactRelativeTime } from "../../../../../lib/format";
import { commandActions } from "../../../../command/commandStore";
import { useNeedsYouUpdate } from "../../../useNeedsYou";

export function InboxSection({
	section,
	sort,
	visibility,
}: Required<Pick<NeedsYouListInput, "section" | "sort" | "visibility">>) {
	const { orpc } = useApp();
	const actor = useActor();
	const mutation = useNeedsYouUpdate();
	const options = orpc.needsYou.list.infiniteOptions({
		input: (cursor: NeedsYouListInput["cursor"]) => ({ section, sort, visibility, cursor }),
		initialPageParam: null,
		getNextPageParam: (page) => page.nextCursor,
	});
	const query = useInfiniteQuery({ ...options, queryKey: [...options.queryKey, actor?.name] });
	const items = query.data?.pages.flatMap((page) => page.items) ?? [];
	const title = section === "review" ? "Needs review" : "Mentioned";
	return (
		<section aria-label={title} className="py-3">
			<SectionHeader title={title} className="px-4 mb-2" />
			{query.isPending && (
				<div className="px-4">
					<Skeleton className="h-11 w-full" />
					<Skeleton className="mt-2 h-11 w-full" />
				</div>
			)}
			{query.isError && (
				<EmptyState className="px-4" title="The items did not load." description={query.error.message} />
			)}
			{!query.isPending && !query.isError && items.length === 0 && (
				<EmptyState
					className="px-4"
					title={
						visibility === "active"
							? section === "review"
								? "Nothing needs review"
								: "No mentions"
							: `No ${visibility} items`
					}
					description={
						visibility === "active"
							? section === "review"
								? "Tickets in human review appear here."
								: "Comments that mention you appear here until their thread is resolved or their ticket is complete."
							: undefined
					}
				/>
			)}
			<ul aria-label={`${title} items`}>
				{items.map((item) => (
					<InboxRow
						key={item.id}
						identifier={item.ticket.identifier}
						title={item.ticket.title}
						priority={item.ticket.priority}
						project={item.ticket.project.path}
						status={
							<StatusIcon
								category={item.ticket.status.category}
								reviewer={item.ticket.status.reviewer ?? undefined}
								label={item.ticket.status.name}
							/>
						}
						age={compactRelativeTime(item.ticket.createdAt)}
						createdAt={item.ticket.createdAt}
						actor={
							item.ticket.lastActor && item.ticket.lastActor.kind !== "system"
								? {
										name: item.ticket.lastActor.displayName ?? item.ticket.lastActor.name,
										kind: item.ticket.lastActor.kind,
									}
								: undefined
						}
						snippet={item.comment?.body}
						sender={item.comment?.actorName}
						wake={visibility === "snoozed" ? (item.snoozedUntil ?? undefined) : undefined}
						link={
							<Link
								to="/t/$identifier"
								params={{ identifier: item.ticket.identifier }}
								search={{ thread: item.comment?.threadId }}
							/>
						}
						actions={[
							{
								label: "Snooze",
								icon: <Clock />,
								disabled: mutation.isPending,
								onSelect: () => commandActions.snooze({ id: item.id, identifier: item.ticket.identifier }),
							},
							{
								label: "Ignore",
								icon: <EyeSlash />,
								disabled: mutation.isPending || visibility === "ignored",
								onSelect: () => mutation.mutate({ id: item.id, action: "ignore" }),
							},
							...(visibility === "active"
								? []
								: [
										{
											label: "Restore",
											icon: <ArrowCounterClockwise />,
											disabled: mutation.isPending,
											onSelect: () => mutation.mutate({ id: item.id, action: "restore" }),
										},
									]),
						]}
					/>
				))}
			</ul>
			{query.hasNextPage && (
				<div className="flex justify-center py-2">
					<Tooltip content={`Load more ${title.toLowerCase()} items`}>
						<IconButton
							label={`Load more ${title.toLowerCase()} items`}
							icon={<ArrowDown />}
							disabled={query.isFetchingNextPage}
							onClick={() => void query.fetchNextPage()}
						/>
					</Tooltip>
				</div>
			)}
		</section>
	);
}
