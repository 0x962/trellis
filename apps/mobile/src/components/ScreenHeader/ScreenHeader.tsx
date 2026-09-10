import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { layout } from "../../theme/layout";
import { tokens } from "../../theme/tokens";
import { usePalette } from "../../theme/usePalette";

export type ScreenHeaderProps = {
	title: string;
	// Runs when the back control is pressed. Without it there is no control.
	onBack?: () => void;
	// The right edge: a count, a time, an action.
	right?: ReactNode;
};

const styles = StyleSheet.create({
	bar: {
		flexDirection: "row",
		alignItems: "center",
		gap: tokens.space[2],
		height: layout.header,
		paddingHorizontal: tokens.space[4],
	},
	back: { minWidth: layout.hit, height: layout.hit, justifyContent: "center", marginLeft: -tokens.space[2] },
	chevron: { fontSize: tokens.text.xl, lineHeight: layout.hit },
	title: { flex: 1, fontSize: tokens.text.xl, lineHeight: tokens.leading.xl, fontWeight: "600" },
});

// The top of every screen: the safe-area inset, a title, and a back control
// on a pushed screen.
export function ScreenHeader({ title, onBack, right }: ScreenHeaderProps) {
	const palette = usePalette();
	const { top } = useSafeAreaInsets();
	return (
		<View style={{ paddingTop: top, backgroundColor: palette.bg }}>
			<View style={styles.bar}>
				{onBack !== undefined && (
					<Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.back}>
						<Text style={[styles.chevron, { color: palette.accent }]}>‹</Text>
					</Pressable>
				)}
				<Text accessibilityRole="header" numberOfLines={1} style={[styles.title, { color: palette.fg }]}>
					{title}
				</Text>
				{right}
			</View>
		</View>
	);
}
