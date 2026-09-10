import { Pressable, StyleSheet, Text, View } from "react-native";
import { layout } from "../../theme/layout";
import { tokens } from "../../theme/tokens";
import { usePalette } from "../../theme/usePalette";

export type SegmentedOption<T extends string> = { value: T; label: string };

export type SegmentedProps<T extends string> = {
	options: readonly SegmentedOption<T>[];
	value: T;
	onChange: (value: T) => void;
};

const styles = StyleSheet.create({
	group: { flexDirection: "row", borderRadius: tokens.radius.md, borderWidth: layout.stroke, overflow: "hidden" },
	option: { flex: 1, minHeight: layout.hit, alignItems: "center", justifyContent: "center" },
	label: { fontSize: tokens.text.base, lineHeight: tokens.leading.base, fontWeight: "500" },
});

// One choice among a few, as a row of radio buttons. The chosen one is filled.
export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
	const palette = usePalette();
	return (
		<View accessibilityRole="radiogroup" style={[styles.group, { borderColor: palette.borderStrong }]}>
			{options.map((option) => {
				const checked = option.value === value;
				return (
					<Pressable
						key={option.value}
						accessibilityRole="radio"
						accessibilityLabel={option.label}
						accessibilityState={{ checked }}
						onPress={() => onChange(option.value)}
						style={[styles.option, { backgroundColor: checked ? palette.accentSoft : palette.surface }]}
					>
						<Text style={[styles.label, { color: checked ? palette.accent : palette.fgMuted }]}>{option.label}</Text>
					</Pressable>
				);
			})}
		</View>
	);
}
