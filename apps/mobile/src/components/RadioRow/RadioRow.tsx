import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { layout } from "../../theme/layout";
import { tokens } from "../../theme/tokens";
import { usePalette } from "../../theme/usePalette";

export type RadioRowProps = {
	label: string;
	checked: boolean;
	// A status icon or a priority icon before the label.
	icon?: ReactNode;
	onPress: () => void;
};

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: tokens.space[3],
		minHeight: layout.hit,
		paddingHorizontal: tokens.space[4],
	},
	label: { flex: 1, fontSize: tokens.text.md, lineHeight: tokens.leading.md },
	check: { fontSize: tokens.text.lg, lineHeight: tokens.leading.lg, fontWeight: "600" },
	iconBox: { width: layout.statusIcon, alignItems: "center" },
});

// One choice in a sheet: a 44 px radio named by its label. The chosen one
// carries a check on the right.
export function RadioRow({ label, checked, icon, onPress }: RadioRowProps) {
	const palette = usePalette();
	return (
		<Pressable
			accessibilityRole="radio"
			accessibilityLabel={label}
			accessibilityState={{ checked }}
			onPress={onPress}
			style={({ pressed }) => [styles.row, pressed && { backgroundColor: palette.surface }]}
		>
			{icon !== undefined && <View style={styles.iconBox}>{icon}</View>}
			<Text style={[styles.label, { color: palette.fg }]}>{label}</Text>
			{checked && <Text style={[styles.check, { color: palette.accent }]}>✓</Text>}
		</Pressable>
	);
}
