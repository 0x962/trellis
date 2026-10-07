import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { layout } from "../../theme/layout";
import { tokens } from "../../theme/tokens";
import { usePalette } from "../../theme/usePalette";

export type ButtonProps = {
	label: string;
	onPress: () => void;
	disabled?: boolean;
	accessibilityHint?: string;
	// `primary` is the one filled action on a screen.
	variant?: "primary" | "secondary";
};

const styles = StyleSheet.create({
	button: {
		minHeight: layout.hit,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: tokens.space[4],
		paddingVertical: tokens.space[2],
		borderRadius: tokens.radius.md,
		borderWidth: layout.stroke,
	},
	label: { fontSize: tokens.text.md, lineHeight: tokens.leading.md, fontWeight: "500" },
	disabled: { opacity: 0.5 },
});

export function Button({ label, onPress, disabled = false, accessibilityHint, variant = "secondary" }: ButtonProps) {
	const palette = usePalette();
	const [focused, setFocused] = useState(false);
	const primary = variant === "primary";
	return (
		<Pressable
			accessibilityHint={accessibilityHint}
			accessibilityRole="button"
			accessibilityLabel={label}
			accessibilityState={{ disabled }}
			disabled={disabled}
			focusable
			onBlur={() => setFocused(false)}
			onFocus={() => setFocused(true)}
			onPress={onPress}
			style={({ pressed }) => [
				styles.button,
				{
					backgroundColor: primary ? palette.accent : palette.surface,
					borderColor: primary ? palette.accent : palette.borderStrong,
				},
				focused && {
					borderColor: primary ? palette.onAccent : palette.accent,
				},
				pressed && { opacity: 0.8 },
				disabled && styles.disabled,
			]}
		>
			<Text style={[styles.label, { color: primary ? palette.onAccent : palette.fg }]}>{label}</Text>
		</Pressable>
	);
}
