import { StyleSheet, Text, View } from "react-native";
import { tokens } from "../../theme/tokens";
import { usePalette } from "../../theme/usePalette";
import { Markdown } from "../Markdown";

export type DescriptionProps = {
	markdown: string;
	// True while an event named the description and the refetch is pending.
	// The old text stays and the hint "Text updating" shows.
	stale?: boolean;
};

const styles = StyleSheet.create({
	box: { paddingHorizontal: tokens.space[4], paddingTop: tokens.space[2] },
	hint: { fontSize: tokens.text.xs, lineHeight: tokens.leading.xs, marginBottom: tokens.space[1] },
});

// The description, rendered from markdown, read only. A task list item is a
// checkbox with its checked state.
export function Description({ markdown, stale = false }: DescriptionProps) {
	const palette = usePalette();
	return (
		<View style={styles.box}>
			{stale && <Text style={[styles.hint, { color: palette.warning }]}>Text updating</Text>}
			<Markdown source={markdown} />
		</View>
	);
}
