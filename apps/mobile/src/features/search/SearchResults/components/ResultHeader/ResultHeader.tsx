import { StyleSheet, Text, View } from "react-native";
import { SectionHeader } from "../../../../../components/SectionHeader";
import { tokens } from "../../../../../theme/tokens";
import { usePalette } from "../../../../../theme/usePalette";
import { countOf } from "../../../searchView";

export type ResultHeaderProps = {
	// The name of the group, such as Tickets.
	label: string;
	// The number of results the group holds.
	count: number;
	// A sentence about the whole group, such as where a Page opens.
	note?: string;
};

const styles = StyleSheet.create({
	note: {
		fontSize: tokens.text.sm,
		lineHeight: tokens.leading.sm,
		paddingHorizontal: tokens.space[4],
		paddingBottom: tokens.space[2],
	},
});

// The line above one group of results. The count reads as "3 results" to a
// screen reader, because the bare number next to the label says nothing.
export function ResultHeader({ label, count, note }: ResultHeaderProps) {
	const palette = usePalette();
	return (
		<View>
			<View accessible accessibilityRole="header" accessibilityLabel={`${label}, ${countOf(count, "result")}`}>
				<SectionHeader label={label} count={count} />
			</View>
			{note !== undefined && <Text style={[styles.note, { color: palette.fgMuted }]}>{note}</Text>}
		</View>
	);
}
