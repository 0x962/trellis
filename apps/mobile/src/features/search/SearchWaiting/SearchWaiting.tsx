import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useReduceMotion } from "../../../hooks/useReduceMotion";
import { tokens } from "../../../theme/tokens";
import { usePalette } from "../../../theme/usePalette";

const styles = StyleSheet.create({
	box: { flex: 1, alignItems: "center", justifyContent: "center", gap: tokens.space[3], padding: tokens.space[6] },
	text: { fontSize: tokens.text.base, lineHeight: tokens.leading.base, textAlign: "center" },
});

// What fills the list while the server works on one query. The words carry
// the state on their own, so a phone that asks for less motion gets them
// without the spinner.
export function SearchWaiting({ query }: { query: string }) {
	const palette = usePalette();
	const reduceMotion = useReduceMotion();
	return (
		<View style={styles.box} testID="search-waiting">
			{!reduceMotion && <ActivityIndicator color={palette.fgMuted} />}
			<Text numberOfLines={2} style={[styles.text, { color: palette.fgMuted }]}>
				Searching for “{query}”
			</Text>
		</View>
	);
}
