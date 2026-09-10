import { StyleSheet, Text, View } from "react-native";
import { tokens } from "../../theme/tokens";
import { usePalette } from "../../theme/usePalette";

export type SectionHeaderProps = {
	label: string;
	// The number of rows the section holds. Absent when the section is not a list.
	count?: number;
};

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "baseline",
		gap: tokens.space[2],
		paddingHorizontal: tokens.space[4],
		paddingTop: tokens.space[5],
		paddingBottom: tokens.space[2],
	},
	label: { fontSize: tokens.text.sm, lineHeight: tokens.leading.sm, fontWeight: "500" },
	count: { fontSize: tokens.text.sm, lineHeight: tokens.leading.sm, fontVariant: ["tabular-nums"] },
});

// The line above a section of the ticket screen: "Pull requests 1", "Timeline".
export function SectionHeader({ label, count }: SectionHeaderProps) {
	const palette = usePalette();
	return (
		<View style={styles.row}>
			<Text style={[styles.label, { color: palette.fgMuted }]}>{label}</Text>
			{count !== undefined && <Text style={[styles.count, { color: palette.fgFaint }]}>{count}</Text>}
		</View>
	);
}
