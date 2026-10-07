import Ionicons from "@expo/vector-icons/Ionicons";
import { ScrollView, StyleSheet } from "react-native";
import { Row } from "../../../components/Row";
import { SectionHeader } from "../../../components/SectionHeader";
import { layout } from "../../../theme/layout";
import { tokens } from "../../../theme/tokens";
import { usePalette } from "../../../theme/usePalette";

export type RecentsProps = {
	// The stored queries, newest first.
	recents: readonly string[];
	// Takes the query of the pressed row and searches for it again.
	onSelect: (query: string) => void;
	// Drops every stored query.
	onClear: () => void;
};

const styles = StyleSheet.create({
	list: { flex: 1 },
	// The control that drops the list keeps a gap above it, so a finger that
	// reaches for the last query does not land on it.
	clear: { marginTop: tokens.space[4] },
});

// The queries this phone searched for before, and one control that drops
// them. The list scrolls, so every row stays reachable when the system text
// size makes the rows taller than the screen.
export function Recents({ recents, onSelect, onClear }: RecentsProps) {
	const palette = usePalette();
	return (
		<ScrollView style={styles.list} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
			<SectionHeader label="Recent searches" count={recents.length} />
			{recents.map((recent) => (
				<Row
					key={recent}
					testID={`recent-search-${recent}`}
					title={recent}
					leading={<Ionicons name="time-outline" size={layout.statusIcon} color={palette.fgFaint} />}
					onPress={() => onSelect(recent)}
				/>
			))}
			<Row
				testID="recent-searches-clear"
				title="Clear recent searches"
				leading={<Ionicons name="trash-outline" size={layout.statusIcon} color={palette.fgMuted} />}
				onPress={onClear}
			/>
		</ScrollView>
	);
}
