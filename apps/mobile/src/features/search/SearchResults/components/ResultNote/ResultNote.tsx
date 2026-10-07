import { StyleSheet, Text } from "react-native";
import { tokens } from "../../../../../theme/tokens";
import { usePalette } from "../../../../../theme/usePalette";

const styles = StyleSheet.create({
	note: {
		fontSize: tokens.text.sm,
		lineHeight: tokens.leading.sm,
		paddingHorizontal: tokens.space[4],
		paddingVertical: tokens.space[3],
	},
});

// The last line of the result list, which belongs to no single result.
export function ResultNote({ text }: { text: string }) {
	const palette = usePalette();
	return <Text style={[styles.note, { color: palette.fgMuted }]}>{text}</Text>;
}
