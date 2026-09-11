import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ActorChip } from "../../../../components/ActorChip";
import { compactRelativeTime } from "../../../../lib/time";
import { layout } from "../../../../theme/layout";
import { tokens } from "../../../../theme/tokens";
import { usePalette } from "../../../../theme/usePalette";
import { describeActivity } from "../../activityLabel";
import type { ActivityRow as ActivityRowData } from "../../timelineRows";

export type ActivityRowProps = {
	row: ActivityRowData;
};

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: tokens.space[2],
		height: layout.activityRow,
		paddingHorizontal: tokens.space[4],
	},
	label: { flex: 1, fontSize: tokens.text.sm, lineHeight: tokens.leading.sm },
	when: { fontSize: tokens.text.sm, lineHeight: tokens.leading.sm, fontVariant: ["tabular-nums"] },
	line: {
		flexDirection: "row",
		gap: tokens.space[2],
		paddingLeft: tokens.space[4] + layout.avatar + tokens.space[2],
		paddingRight: tokens.space[4],
		paddingBottom: tokens.space[1],
	},
});

// One 32 px line: the actor, what changed, and the time. A run of several
// changes shows one line and expands on press into one line per change.
export function ActivityRow({ row }: ActivityRowProps) {
	const palette = usePalette();
	const [expanded, setExpanded] = useState(false);
	const run = row.items.length > 1;
	return (
		<View>
			<Pressable
				testID="activity-row"
				accessibilityRole={run ? "button" : undefined}
				accessibilityState={run ? { expanded } : undefined}
				disabled={!run}
				onPress={() => setExpanded((value) => !value)}
				style={styles.row}
			>
				<ActorChip name={row.actor.name} kind={row.actor.kind} />
				<Text numberOfLines={1} style={[styles.label, { color: palette.fgMuted }]}>
					{row.label}
				</Text>
				<Text style={[styles.when, { color: palette.fgFaint }]}>{compactRelativeTime(row.at)}</Text>
			</Pressable>
			{expanded &&
				row.items.map((item) => (
					<View key={item.id} testID="activity-line" style={styles.line}>
						<Text style={[styles.label, { color: palette.fgMuted }]}>{describeActivity(item)}</Text>
						<Text style={[styles.when, { color: palette.fgFaint }]}>{compactRelativeTime(item.createdAt)}</Text>
					</View>
				))}
		</View>
	);
}
