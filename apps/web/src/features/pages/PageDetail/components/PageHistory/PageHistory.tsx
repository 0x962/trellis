import { ArrowClockwise, ArrowDown } from "@phosphor-icons/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { PageDetail as PageRecord } from "@trellis/api";
import { FailureState, IconButton, PageVersionRow, Sheet, Spinner, Tooltip } from "@trellis/ui";
import type { RefObject } from "react";
import { useApp } from "../../../../../lib/appContext";

export function PageHistory({
	page,
	onClose,
	finalFocus,
}: {
	page: PageRecord;
	onClose: () => void;
	finalFocus: RefObject<HTMLButtonElement | null>;
}) {
	const { orpc } = useApp();
	const query = useInfiniteQuery(
		orpc.pages.versions.infiniteOptions({
			input: (cursor: string | undefined) => ({ page: page.ref, cursor }),
			initialPageParam: undefined as string | undefined,
			getNextPageParam: (result) => result.nextCursor ?? undefined,
		}),
	);
	return (
		<Sheet
			finalFocus={finalFocus}
			open
			title="Version history"
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			{query.isPending && <Spinner />}
			{query.isError && (
				<FailureState
					title="The version history did not load"
					detail={query.error.message}
					action={
						<Tooltip content="Retry">
							<IconButton label="Retry" icon={<ArrowClockwise />} onClick={() => void query.refetch()} />
						</Tooltip>
					}
				/>
			)}
			<ul aria-label="Page versions">
				{query.data?.pages
					.flatMap((result) => result.items)
					.map((version) => (
						<PageVersionRow
							key={version.number}
							number={version.number}
							label={version.label}
							actor={version.actor.displayName ?? version.actor.name}
							sourcePath={version.sourcePath}
							sha256={version.documentSha256}
							bytes={version.documentSize}
							publishedAt={version.createdAt}
							selected={page.requestedVersion.number === version.number}
							link={
								<Link to="/p/$" params={{ _splat: page.ref }} search={{ version: version.number }} onClick={onClose} />
							}
						/>
					))}
			</ul>
			{query.hasNextPage && (
				<Tooltip content="Load more versions">
					<IconButton
						label="Load more versions"
						icon={<ArrowDown />}
						disabled={query.isFetchingNextPage}
						onClick={() => void query.fetchNextPage()}
					/>
				</Tooltip>
			)}
		</Sheet>
	);
}
