import type { TicketSummary } from "@trellis/api";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Row } from "../../components/Row";
import { SectionHeader } from "../../components/SectionHeader";
import { StatusIcon } from "../../components/StatusIcon";
import { layout } from "../../theme/layout";
import { tokens } from "../../theme/tokens";
import { usePalette } from "../../theme/usePalette";
import { subTicketProgress } from "./progress";

export type SubTicketsProps = {
	// The children of the ticket. The section renders nothing for an empty list.
	tickets: readonly TicketSummary[];
};

const styles = StyleSheet.create({
	bar: {
		flexDirection: "row",
		alignItems: "center",
		gap: tokens.space[3],
		paddingHorizontal: tokens.space[4],
		paddingBottom: tokens.space[2],
	},
	track: { flex: 1, height: layout.bar, borderRadius: tokens.hairline, overflow: "hidden" },
	fill: { height: "100%" },
	count: { fontSize: tokens.text.sm, lineHeight: tokens.leading.sm, fontVariant: ["tabular-nums"] },
});

// The sub-ticket rows with the progress bar. A row opens its ticket through
// `router.push` from expo-router.
export function SubTickets({ tickets }: SubTicketsProps) {
	const palette = usePalette();
	const progress = subTicketProgress(tickets);
	if (progress === null) return null;
	return (
		<View>
			<SectionHeader label="Sub-tickets" count={progress.total} />
			<View style={styles.bar}>
				<View testID="sub-ticket-progress" style={[styles.track, { backgroundColor: palette.borderStrong }]}>
					<View style={[styles.fill, { width: `${progress.share * 100}%`, backgroundColor: palette.success }]} />
				</View>
				<Text style={[styles.count, { color: palette.fgMuted }]}>
					{progress.done} of {progress.total}
				</Text>
			</View>
			{tickets.map((child) => (
				<Row
					key={child.id}
					id={child.identifier}
					title={child.title}
					leading={
						<StatusIcon
							category={child.status.category}
							reviewer={child.status.reviewer ?? undefined}
							label={`Status: ${child.status.name}`}
						/>
					}
					onPress={() => router.push(`/ticket/${child.identifier}`)}
				/>
			))}
		</View>
	);
}
