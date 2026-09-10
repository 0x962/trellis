import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { layout } from "../../theme/layout";
import { tokens } from "../../theme/tokens";
import { usePalette } from "../../theme/usePalette";

export type ChipProps = {
	children: string;
	// A branch, a slug, or an identifier reads in mono.
	mono?: boolean;
	// A StatusIcon or a PriorityIcon before the label.
	icon?: ReactNode;
};

const styles = StyleSheet.create({
	chip: {
		flexDirection: "row",
		alignItems: "center",
		alignSelf: "flex-start",
		gap: tokens.space[1],
		height: tokens.space[5],
		paddingHorizontal: tokens.space[1] + tokens.space.half,
		borderRadius: tokens.radius.sm,
		borderWidth: layout.stroke,
	},
	label: { fontSize: tokens.text.xs, lineHeight: tokens.leading.xs },
	mono: { fontFamily: tokens.font.mono },
});

// A small bordered label: a parent ticket, a branch, a filter value.
export function Chip({ children, mono = false, icon }: ChipProps) {
	const palette = usePalette();
	return (
		<View style={[styles.chip, { borderColor: palette.border, backgroundColor: palette.surface }]}>
			{icon}
			<Text numberOfLines={1} style={[styles.label, mono && styles.mono, { color: palette.fgMuted }]}>
				{children}
			</Text>
		</View>
	);
}
