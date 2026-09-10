import { FlashList } from "@shopify/flash-list";
import { useInfiniteQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { EmptyState } from "../../../components/EmptyState";
import { Segmented, type SegmentedOption } from "../../../components/Segmented";
import { TicketRow } from "../../../components/TicketRow";
import { UnreachableServer } from "../../../components/UnreachableServer";
import { getQueries } from "../../../lib/orpc";
import { keys, store } from "../../../lib/store";
import { tokens } from "../../../theme/tokens";
import { listQueryInput, type Segment, type SortValue } from "./listQuery";

export type ProjectTicketListProps = {
	// The project ref from the route. The list sends its canonical spelling.
	project: string;
};

const segments: readonly SegmentedOption<Segment>[] = [
	{ value: "active", label: "Active" },
	{ value: "review", label: "Review" },
	{ value: "done", label: "Done" },
];

const sorts: readonly SegmentedOption<SortValue>[] = [
	{ value: "updated", label: "Updated" },
	{ value: "priority", label: "Priority" },
];

const styles = StyleSheet.create({
	page: { flex: 1 },
	controls: { gap: tokens.space[2], padding: tokens.space[3] },
	list: { flex: 1 },
});

// The stored server without its scheme, as the unreachable state names it.
const hostOf = (url: string) => url.replace(/^https?:\/\//, "");

// One project's tickets: the segmented filter, the sort toggle, and the
// pages the cursor reads. Each filter is its own query, so a change of the
// filter starts at the first page and the cursor of the old filter is gone.
// A first page the server did not send shows the unreachable state, not the
// empty state.
export function ProjectTicketList({ project }: ProjectTicketListProps) {
	const [segment, setSegment] = useState<Segment>("active");
	const [sort, setSort] = useState<SortValue>("updated");
	const list = useInfiniteQuery(
		getQueries().tickets.list.infiniteOptions({
			input: (cursor: string | undefined) => listQueryInput({ project, segment, sort, cursor }),
			initialPageParam: undefined as string | undefined,
			getNextPageParam: (page) => page.nextCursor ?? undefined,
		}),
	);
	const tickets = list.data?.pages.flatMap((page) => page.items) ?? [];
	const readNextPage = () => {
		if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
	};
	const empty = list.isPending ? null : list.isError ? (
		<UnreachableServer
			host={hostOf(store.getString(keys.serverUrl)!)}
			onRetry={() => void list.refetch()}
			onChangeServer={() => router.push("/setup")}
		/>
	) : (
		<EmptyState title="No tickets here" hint="Another filter holds the rest of this project." />
	);
	return (
		<View style={styles.page}>
			<View style={styles.controls}>
				<Segmented options={segments} value={segment} onChange={setSegment} />
				<Segmented options={sorts} value={sort} onChange={setSort} />
			</View>
			{tickets.length === 0 ? (
				empty
			) : (
				<FlashList
					testID="ticket-list"
					style={styles.list}
					data={tickets}
					keyExtractor={(ticket) => ticket.id}
					onEndReached={readNextPage}
					renderItem={({ item }) => (
						<TicketRow
							testID={`ticket-row-${item.identifier}`}
							ticket={item}
							onPress={(identifier) => router.push(`/ticket/${identifier}`)}
						/>
					)}
				/>
			)}
		</View>
	);
}
