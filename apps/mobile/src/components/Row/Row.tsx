import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { layout } from "../../theme/layout";
import { tokens } from "../../theme/tokens";
import { usePalette } from "../../theme/usePalette";

export type RowProps = {
	// The ticket identifier, in mono.
	id?: string;
	// The ticket title, in mono.
	title: string;
	// A status icon or a priority icon before the id.
	leading?: ReactNode;
	// The line under the title: a ribbon, an actor, a parent chip.
	meta?: ReactNode;
	// The right edge, such as the time waiting.
	trailing?: string;
	// A row without onPress is not a button, so a screen reader skips it.
	onPress?: () => void;
	// The height every row of one list paints, in px. FlashList recycles a
	// row of a fixed height without a measure pass.
	height?: number;
	testID?: string;
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
	id: {
		fontFamily: tokens.font.mono,
		fontSize: tokens.text.sm,
		lineHeight: tokens.leading.sm,
		fontVariant: ["tabular-nums"],
	},
	body: { flex: 1, gap: tokens.space.half, justifyContent: "center" },
	title: { fontFamily: tokens.font.mono, fontSize: tokens.text.md, lineHeight: tokens.leading.md },
	meta: { flexDirection: "row", alignItems: "center", gap: tokens.space[2], overflow: "hidden" },
	trailing: { fontSize: tokens.text.sm, lineHeight: tokens.leading.sm, fontVariant: ["tabular-nums"] },
});

// One list row: a fixed hit area of 44 px, the title on one line. The title
// and the id both paint in mono. A fixed height keeps FlashList rows the
// same size.
export function Row({ id, title, leading, meta, trailing, onPress, height, testID }: RowProps) {
	const palette = usePalette();
	return (
		<Pressable
			accessible={onPress !== undefined}
			accessibilityRole={onPress === undefined ? undefined : "button"}
			testID={testID}
			onPress={onPress}
			style={({ pressed }) => [
				styles.row,
				height !== undefined && { height },
				{ borderBottomColor: palette.border, backgroundColor: pressed ? palette.surface : palette.bg },
			]}
		>
			{leading}
			{id !== undefined && <Text style={[styles.id, { color: palette.fgMuted }]}>{id}</Text>}
			<View style={styles.body}>
				<Text numberOfLines={1} style={[styles.title, { color: palette.fg }]}>
					{title}
				</Text>
				{meta !== undefined && <View style={styles.meta}>{meta}</View>}
			</View>
			{trailing !== undefined && <Text style={[styles.trailing, { color: palette.fgFaint }]}>{trailing}</Text>}
		</Pressable>
	);
}
