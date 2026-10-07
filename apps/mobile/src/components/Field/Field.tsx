import { useState } from "react";
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
	| "onFocus"
	| "onBlur"
> & {
	// The visible label; also the accessibility label of the input.
	label: string;
	// A line under the input, such as a hint or a validation message.
	note?: string;
	error?: string;
};

const styles = StyleSheet.create({
	field: { gap: tokens.space[1] + tokens.space.half },
	label: { fontSize: tokens.text.sm, lineHeight: tokens.leading.sm, fontWeight: "500" },
	input: {
		minHeight: layout.hit,
		paddingHorizontal: tokens.space[3],
		paddingVertical: tokens.space[2],
		borderRadius: tokens.radius.md,
		borderWidth: layout.stroke,
		fontSize: tokens.text.md,
		lineHeight: tokens.leading.md,
	},
	note: { fontSize: tokens.text.sm, lineHeight: tokens.leading.sm },
});

// A labeled text input.
export function Field({ label, note, error, onFocus, onBlur, ...input }: FieldProps) {
	const palette = usePalette();
	const [focused, setFocused] = useState(false);
	const message = error ?? note;
	return (
		<View style={styles.field}>
			<Text style={[styles.label, { color: palette.fgMuted }]}>{label}</Text>
			<TextInput
				{...input}
				accessibilityHint={message}
				accessibilityLabel={label}
				aria-invalid={error !== undefined}
				onBlur={(event) => {
					setFocused(false);
					onBlur?.(event);
				}}
				onFocus={(event) => {
					setFocused(true);
					onFocus?.(event);
				}}
				placeholderTextColor={palette.fgFaint}
				style={[
					styles.input,
					{
						color: palette.fg,
						backgroundColor: palette.surface,
						borderColor: error === undefined ? palette.borderStrong : palette.danger,
					},
					focused && { borderColor: palette.accent },
				]}
			/>
			{message !== undefined && (
				<Text
					accessibilityLiveRegion={error === undefined ? "none" : "assertive"}
					accessibilityRole={error === undefined ? undefined : "alert"}
					style={[styles.note, { color: error === undefined ? palette.fgMuted : palette.danger }]}
				>
					{message}
				</Text>
			)}
		</View>
	);
}
