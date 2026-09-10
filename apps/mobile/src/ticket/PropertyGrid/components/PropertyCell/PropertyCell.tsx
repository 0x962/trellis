import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { layout } from "../../../../theme/layout";
import { tokens } from "../../../../theme/tokens";
import { usePalette } from "../../../../theme/usePalette";

export type PropertyCellProps = {
	// The small label above the value; also the accessibility name of the cell.
	label: string;
	children: ReactNode;
	// A cell with `onPress` is a button that opens a sheet. A cell with a
	// `link` opens another screen. A cell with neither is static.
	onPress?: () => void;
	link?: () => void;
};

const styles = StyleSheet.create({
	cell: {
		flex: 1,
		minHeight: layout.hit,
		gap: tokens.space[1],
		paddingHorizontal: tokens.space[3],
		paddingVertical: tokens.space[2],
		borderRadius: tokens.radius.lg,
		borderWidth: layout.stroke,
	},
	label: { fontSize: tokens.text.xs, lineHeight: tokens.leading.xs },
	value: { flexDirection: "row", alignItems: "center", gap: tokens.space[2], minHeight: tokens.leading.md },
});

// One cell of the property grid: the label, then the value row.
export function PropertyCell({ label, children, onPress, link }: PropertyCellProps) {
	const palette = usePalette();
	const role = onPress !== undefined ? "button" : link !== undefined ? "link" : undefined;
	return (
		<Pressable
			accessibilityRole={role}
			accessibilityLabel={label}
			disabled={role === undefined}
			onPress={onPress ?? link}
			style={({ pressed }) => [
				styles.cell,
				{ backgroundColor: pressed ? palette.elevated : palette.surface, borderColor: palette.border },
			]}
		>
			<Text style={[styles.label, { color: palette.fgMuted }]}>{label}</Text>
			<View style={styles.value}>{children}</View>
		</Pressable>
	);
}
