import { Pressable, StyleSheet, Text, useWindowDimensions } from "react-native";
import { layout } from "../../theme/layout";
import { tokens } from "../../theme/tokens";
import { usePalette } from "../../theme/usePalette";

export type KeyValueRowProps = {
	label: string;
	value: string;
	// When set, the row is a button and shows a chevron.
	onPress?: () => void;
};

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: tokens.space[3],
		minHeight: layout.hit,
		paddingHorizontal: tokens.space[4],
		paddingVertical: tokens.space[2],
		borderBottomWidth: layout.stroke,
	},
	stackedRow: { flexDirection: "column", alignItems: "stretch" },
	label: { flex: 1, fontSize: tokens.text.md, lineHeight: tokens.leading.md },
	value: { flex: 1, textAlign: "right", fontSize: tokens.text.md, lineHeight: tokens.leading.md },
	stackedText: { flex: 0, width: "100%", textAlign: "left" },
	chevron: { fontSize: tokens.text.lg, lineHeight: tokens.leading.lg },
	stackedChevron: { alignSelf: "flex-end" },
});

// A settings line that stacks its label and value when two columns do not fit.
export function KeyValueRow({ label, value, onPress }: KeyValueRowProps) {
	const palette = usePalette();
	const { width } = useWindowDimensions();
	const stacked = width < 240;
	return (
		<Pressable
			accessibilityRole={onPress ? "button" : undefined}
			disabled={onPress === undefined}
			onPress={onPress}
			style={[styles.row, stacked && styles.stackedRow, { borderBottomColor: palette.border }]}
		>
			<Text style={[styles.label, stacked && styles.stackedText, { color: palette.fg }]}>{label}</Text>
			<Text style={[styles.value, stacked && styles.stackedText, { color: palette.fgMuted }]}>{value}</Text>
			{onPress !== undefined && (
				<Text style={[styles.chevron, stacked && styles.stackedChevron, { color: palette.fgFaint }]}>›</Text>
			)}
		</Pressable>
	);
}
