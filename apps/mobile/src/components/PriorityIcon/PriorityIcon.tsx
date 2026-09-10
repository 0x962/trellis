import { StyleSheet, Text, View } from "react-native";
import { layout } from "../../theme/layout";
import { tokens } from "../../theme/tokens";
import { usePalette } from "../../theme/usePalette";

export type Priority = "none" | "low" | "medium" | "high" | "urgent";

export type PriorityIconProps = {
	priority: Priority;
};

const filledBars: Record<Exclude<Priority, "urgent">, number> = { none: 0, low: 1, medium: 2, high: 3 };

const barHeights = [tokens.space[1], tokens.space[2], tokens.space[3]];

const styles = StyleSheet.create({
	bars: { flexDirection: "row", alignItems: "flex-end", gap: tokens.space.half, height: tokens.space[3] },
	bar: { width: layout.bar, borderRadius: tokens.hairline },
	square: {
		width: layout.mark,
		height: layout.mark,
		borderRadius: tokens.radius.sm,
		alignItems: "center",
		justifyContent: "center",
	},
	mark: { fontSize: tokens.micro.kbd, lineHeight: layout.mark, fontWeight: "700", color: tokens.onAccent },
});

// Three rising bars fill from the left as the priority rises. Urgent is a
// filled danger square with an exclamation mark, so it reads from across
// the room.
export function PriorityIcon({ priority }: PriorityIconProps) {
	const palette = usePalette();
	const label = `Priority: ${priority}`;
	if (priority === "urgent") {
		return (
			<View
				accessibilityRole="image"
				accessibilityLabel={label}
				style={[styles.square, { backgroundColor: palette.danger }]}
			>
				<Text style={styles.mark}>!</Text>
			</View>
		);
	}
	const filled = filledBars[priority];
	return (
		<View accessibilityRole="image" accessibilityLabel={label} style={styles.bars}>
			{barHeights.map((height, index) => (
				<View
					key={height}
					testID="priority-bar"
					style={[styles.bar, { height, backgroundColor: index < filled ? palette.fgMuted : palette.borderStrong }]}
				/>
			))}
		</View>
	);
}
