import { Pressable, StyleSheet, Text } from "react-native";
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
		borderBottomWidth: layout.stroke,
	},
	label: { fontSize: tokens.text.md, lineHeight: tokens.leading.md },
	value: { flex: 1, textAlign: "right", fontSize: tokens.text.md, lineHeight: tokens.leading.md },
	chevron: { fontSize: tokens.text.lg, lineHeight: tokens.leading.lg },
});

// A settings line: the label on the left, the value on the right.
export function KeyValueRow({ label, value, onPress }: KeyValueRowProps) {
	const palette = usePalette();
	return (
		<Pressable
			accessibilityRole={onPress ? "button" : undefined}
			disabled={onPress === undefined}
			onPress={onPress}
			style={[styles.row, { borderBottomColor: palette.border }]}
		>
			<Text style={[styles.label, { color: palette.fg }]}>{label}</Text>
			<Text numberOfLines={1} style={[styles.value, { color: palette.fgMuted }]}>
				{value}
			</Text>
			{onPress !== undefined && <Text style={[styles.chevron, { color: palette.fgFaint }]}>›</Text>}
		</Pressable>
	);
}
