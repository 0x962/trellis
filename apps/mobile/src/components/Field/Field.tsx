import { StyleSheet, Text, TextInput, type TextInputProps, View } from "react-native";
import { layout } from "../../theme/layout";
import { tokens } from "../../theme/tokens";
import { usePalette } from "../../theme/usePalette";

export type FieldProps = Pick<
	TextInputProps,
	| "value"
	| "onChangeText"
	| "placeholder"
	| "keyboardType"
	| "autoCapitalize"
	| "autoCorrect"
	| "autoComplete"
	| "testID"
	| "returnKeyType"
	| "onSubmitEditing"
> & {
	// The visible label; also the accessibility label of the input.
	label: string;
	// A line under the input, such as a hint or a validation message.
	note?: string;
	mono?: boolean;
};

const styles = StyleSheet.create({
	field: { gap: tokens.space[1] + tokens.space.half },
	label: { fontSize: tokens.text.sm, lineHeight: tokens.leading.sm, fontWeight: "500" },
	input: {
		minHeight: layout.hit,
		paddingHorizontal: tokens.space[3],
		borderRadius: tokens.radius.md,
		borderWidth: layout.stroke,
		fontSize: tokens.text.md,
	},
	mono: { fontFamily: tokens.font.mono },
	note: { fontSize: tokens.text.sm, lineHeight: tokens.leading.sm },
});

// A labeled text input.
export function Field({ label, note, mono = false, ...input }: FieldProps) {
	const palette = usePalette();
	return (
		<View style={styles.field}>
			<Text style={[styles.label, { color: palette.fgMuted }]}>{label}</Text>
			<TextInput
				accessibilityLabel={label}
				placeholderTextColor={palette.fgFaint}
				style={[
					styles.input,
					mono && styles.mono,
					{ color: palette.fg, backgroundColor: palette.surface, borderColor: palette.borderStrong },
				]}
				{...input}
			/>
			{note !== undefined && <Text style={[styles.note, { color: palette.fgMuted }]}>{note}</Text>}
		</View>
	);
}
