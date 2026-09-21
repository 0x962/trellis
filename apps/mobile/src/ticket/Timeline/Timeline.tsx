import { FlashList } from "@shopify/flash-list";
import type { ReactElement } from "react";
import { StyleSheet } from "react-native";
import { tokens } from "../../theme/tokens";
import { ActivityRow } from "./components/ActivityRow";
import type { TimelineRow } from "./timelineRows";

export type TimelineProps = {
	rows: readonly TimelineRow[];
	// The sections above the timeline: the title, the grid, the description,
	// the sub-tickets, the pull requests, and the attachments.
	header: ReactElement;
	// The row under the oldest item, such as the control that reads the next
	// older page.
	footer?: ReactElement;
};

const styles = StyleSheet.create({
	content: { paddingBottom: tokens.space[4] },
});

const renderRow = ({ item }: { item: TimelineRow }) => <ActivityRow row={item} />;

// The FlashList of the ticket screen, under `testID="ticket-timeline"`. An
// activity row is a 32 px line under `testID="activity-row"`; a run expands
// on press into one `testID="activity-line"` per item.
export function Timeline({ rows, header, footer }: TimelineProps) {
	return (
		<FlashList
			testID="ticket-timeline"
			data={rows}
			keyExtractor={(row) => row.key}
			getItemType={(row) => row.kind}
			renderItem={renderRow}
			ListHeaderComponent={header}
			ListFooterComponent={footer}
			contentContainerStyle={styles.content}
			keyboardShouldPersistTaps="handled"
			keyboardDismissMode="on-drag"
		/>
	);
}
