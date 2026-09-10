import { Pressable, StyleSheet, Text } from "react-native";
import { layout } from "../../theme/layout";
import { tokens } from "../../theme/tokens";
import { usePalette } from "../../theme/usePalette";

export type ButtonProps = {
	label: string;
	onPress: () => void;
	disabled?: boolean;
	// `primary` is the one filled action on a screen.
	variant?: "primary" | "secondary";
};

const styles = StyleSheet.create({
	button: {
		minHeight: layout.hit,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: tokens.space[4],
		borderRadius: tokens.radius.md,
		borderWidth: layout.stroke,
	},
	label: { fontSize: tokens.text.md, lineHeight: tokens.leading.md, fontWeight: "500" },
	disabled: { opacity: 0.5 },
});

export function Button({ label, onPress, disabled = false, variant = "secondary" }: ButtonProps) {
	const palette = usePalette();
	const primary = variant === "primary";
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			accessibilityState={{ disabled }}
			disabled={disabled}
			onPress={onPress}
			style={({ pressed }) => [
				styles.button,
				{
					backgroundColor: primary ? palette.accent : palette.surface,
					borderColor: primary ? palette.accent : palette.borderStrong,
				},
				pressed && { opacity: 0.8 },
				disabled && styles.disabled,
			]}
		>
			<Text style={[styles.label, { color: primary ? tokens.onAccent : palette.fg }]}>{label}</Text>
		</Pressable>
	);
}
