import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Field } from "../../../components/Field";
import { layout } from "../../../theme/layout";
import { tokens } from "../../../theme/tokens";
import { usePalette } from "../../../theme/usePalette";

export type SearchBarProps = {
	value: string;
	onChangeText: (next: string) => void;
	// Runs when the return key opens the identifier the field names.
	onSubmit: () => void;
	onClear: () => void;
	// The complete ticket identifier the field names, such as CDE-42, or null
	// when the text is not one identifier.
	identifier: string | null;
};

const styles = StyleSheet.create({
	bar: { paddingHorizontal: tokens.space[4], paddingTop: tokens.space[4], paddingBottom: tokens.space[2] },
	row: { flexDirection: "row", alignItems: "flex-end", gap: tokens.space[2] },
	field: { flex: 1 },
	// The square at the right edge of the field keeps its size whether it
	// holds the clear control or the search mark, so the field keeps one
	// width and the text in it never reflows.
	slot: { width: layout.hit, height: layout.hit, alignItems: "center", justifyContent: "center" },
	// The hint holds its own line height whether or not it holds words, so
	// the results under it stay where they are while a person types.
	hint: {
		height: tokens.leading.sm,
		marginTop: tokens.space[1],
		fontSize: tokens.text.sm,
		lineHeight: tokens.leading.sm,
	},
});

// The search field, a control that empties it, and one line that names the
// ticket the return key opens.
export function SearchBar({ value, onChangeText, onSubmit, onClear, identifier }: SearchBarProps) {
	const palette = usePalette();
	return (
		<View style={styles.bar}>
			<View style={styles.row}>
				<View style={styles.field}>
					<Field
						testID="search-field"
						label="Search"
						placeholder="Identifier, title, or text"
						value={value}
						onChangeText={onChangeText}
						autoCapitalize="none"
						autoCorrect={false}
						returnKeyType="search"
						onSubmitEditing={onSubmit}
					/>
				</View>
				{value === "" ? (
					<View style={styles.slot} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
						<Ionicons name="search-outline" size={tokens.space[5]} color={palette.fgFaint} />
					</View>
				) : (
					<Pressable
						accessibilityRole="button"
						accessibilityLabel="Clear the search"
						testID="search-clear"
						onPress={onClear}
						style={({ pressed }) => [styles.slot, pressed && { opacity: 0.6 }]}
					>
						<Ionicons name="close-circle" size={tokens.space[5]} color={palette.fgMuted} />
					</Pressable>
				)}
			</View>
			<Text numberOfLines={1} style={[styles.hint, { color: palette.fgMuted }]}>
				{identifier === null ? "" : `Return opens ${identifier}.`}
			</Text>
		</View>
	);
}
