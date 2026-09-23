import { ArrowCounterClockwise, ArrowDown, Clock, EyeSlash } from "@phosphor-icons/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { NeedsYouListInput } from "@trellis/api";
import {
	Button,
	EmptyState,
	GroupHeader,
	IconButton,
	InboxRow,
	Skeleton,
	StatusIcon,
	Tooltip,
	useMediaQuery,
} from "@trellis/ui";
import { useId } from "react";
import { useActor } from "../../../../../lib/actor";
import { useApp } from "../../../../../lib/appContext";
import { compactRelativeTime } from "../../../../../lib/format";
import { uiActions, useUiStore } from "../../../../../stores/uiStore";
import { ActorAvatar } from "../../../../agents/ActorAvatar";
import { commandActions } from "../../../../command/commandStore";
import { TicketLink } from "../../../../shell/TicketLink";
import { statusIconProps } from "../../../../statusIconProps";
import { useNeedsYouUpdate } from "../../../useNeedsYou";

export function InboxSection({
	section,
	sort,
	visibility,
}: Required<Pick<NeedsYouListInput, "section" | "sort" | "visibility">>) {
	const { orpc, queryClient } = useApp();
	const actor = useActor();
	const contentId = useId();
	const phone = useMediaQuery("(max-width: 767px)");
	const collapsed = useUiStore((state) => state.collapsedGroups["/needs-you"]?.includes(section) ?? false);
	const mutation = useNeedsYouUpdate();
	const options = orpc.needsYou.list.infiniteOptions({
		input: (cursor: NeedsYouListInput["cursor"]) => ({ section, sort, visibility, cursor }),
		initialPageParam: null,
		getNextPageParam: (page) => page.nextCursor,
	});
	const query = useInfiniteQuery({ ...options, queryKey: [...options.queryKey, actor?.name] });
	const items = query.data?.pages.flatMap((page) => page.items) ?? [];
	const failed = query.data === undefined && query.failureCount > 0;
	const title = "Needs review";
	return (
		<section aria-label={title}>
			<GroupHeader
				group={section}
				label={title}
				count={query.data?.pages[0]?.total}
				expanded={!collapsed}
				onToggle={() => uiActions.toggleGroup("/needs-you", section)}
				phone={phone}
				controls={contentId}
				sticky
			/>
			<div id={contentId} hidden={collapsed}>
				{query.isPending && !failed && (
					<div className="px-4">
						<Skeleton className="h-11 w-full" />
						<Skeleton className="mt-2 h-11 w-full" />
					</div>
				)}
				{failed && (
					<EmptyState
						className="px-4"
						title="Could not load items"
						action={
							<Button
								size="md"
								onClick={() =>
									void queryClient.resetQueries({ queryKey: [...options.queryKey, actor?.name], exact: true })
								}
							>
								Retry
							</Button>
						}
					/>
				)}
				{query.isError && !failed && <EmptyState className="px-4" title="Could not load items" />}
				{!query.isPending && !query.isError && !failed && items.length === 0 && (
					<EmptyState
						className="px-4"
						title={visibility === "active" ? "Nothing needs review" : `No ${visibility} items`}
						description={
							visibility === "active"
								? "A ticket in human review, or with an open pull request, appears here while no agent works on it. It leaves when its status moves on."
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
							project={item.ticket.project.key}
							status={<StatusIcon {...statusIconProps(item.ticket.status)} label={item.ticket.status.name} />}
							age={compactRelativeTime(item.ticket.createdAt)}
							createdAt={item.ticket.createdAt}
							actor={<ActorAvatar ticketId={item.ticket.id} />}
							wake={visibility === "snoozed" ? (item.snoozedUntil ?? undefined) : undefined}
							link={<TicketLink identifier={item.ticket.identifier} />}
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
			</div>
		</section>
	);
}
