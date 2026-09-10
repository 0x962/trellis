import { StyleSheet, Text, View } from "react-native";
import { tokens } from "../../theme/tokens";
import { usePalette } from "../../theme/usePalette";

export type EmptyStateProps = {
	title: string;
	hint?: string;
};

const styles = StyleSheet.create({
	box: { flex: 1, alignItems: "center", justifyContent: "center", gap: tokens.space[1], padding: tokens.space[6] },
	title: { fontSize: tokens.text.md, lineHeight: tokens.leading.md, fontWeight: "500" },
	hint: { fontSize: tokens.text.base, lineHeight: tokens.leading.base, textAlign: "center" },
});

// What a list shows when it holds nothing: one line that says so, and one
// line that says what fills it.
export function EmptyState({ title, hint }: EmptyStateProps) {
	const palette = usePalette();
	return (
		<View style={styles.box}>
			<Text style={[styles.title, { color: palette.fgMuted }]}>{title}</Text>
			{hint !== undefined && <Text style={[styles.hint, { color: palette.fgFaint }]}>{hint}</Text>}
		</View>
	);
}
