import { useEffect, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { layout } from "../../../../theme/layout";
import { tokens } from "../../../../theme/tokens";
import { usePalette } from "../../../../theme/usePalette";

export type ToastProps = {
	title: string;
	// The server message, under the title.
	detail?: string;
	// An error toast lives 6 s; a success toast lives 3 s.
	tone: "error" | "success";
	action?: { label: string; onPress: () => void };
	onDismiss: () => void;
};

const lifetimeMs: Record<ToastProps["tone"], number> = { error: 6_000, success: 3_000 };

const styles = StyleSheet.create({
	toast: {
		position: "absolute",
		left: tokens.space[4],
		right: tokens.space[4],
		bottom: tokens.space[4],
		flexDirection: "row",
		alignItems: "center",
		gap: tokens.space[3],
		padding: tokens.space[3],
		borderRadius: tokens.radius.lg,
		borderWidth: layout.stroke,
		borderLeftWidth: tokens.space[1],
	},
	lines: { flex: 1, gap: tokens.space.half },
	title: { fontSize: tokens.text.md, lineHeight: tokens.leading.md, fontWeight: "500" },
	detail: { fontSize: tokens.text.base, lineHeight: tokens.leading.base },
	action: { minHeight: layout.hit, justifyContent: "center", paddingHorizontal: tokens.space[2] },
	actionLabel: { fontSize: tokens.text.md, lineHeight: tokens.leading.md, fontWeight: "600" },
});

// One line over the tab bar that names what happened. The toast dismisses
// itself after its lifetime. The action leaves the dismissal to its owner.
export function Toast({ title, detail, tone, action, onDismiss }: ToastProps) {
	const palette = usePalette();
	const dismiss = useRef(onDismiss);
	dismiss.current = onDismiss;

	useEffect(() => {
		const timer = setTimeout(() => dismiss.current(), lifetimeMs[tone]);
		return () => clearTimeout(timer);
	}, [tone]);

	const stripe = tone === "error" ? palette.danger : palette.success;
	return (
		<View
			testID="toast"
			accessibilityLiveRegion="polite"
			style={[
				styles.toast,
				{ backgroundColor: palette.elevated, borderColor: palette.border, borderLeftColor: stripe },
			]}
		>
			<View style={styles.lines}>
				<Text style={[styles.title, { color: palette.fg }]}>{title}</Text>
				{detail !== undefined && <Text style={[styles.detail, { color: palette.fgMuted }]}>{detail}</Text>}
			</View>
			{action !== undefined && (
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={action.label}
					onPress={action.onPress}
					style={({ pressed }) => [styles.action, pressed && { opacity: 0.8 }]}
				>
					<Text style={[styles.actionLabel, { color: palette.accent }]}>{action.label}</Text>
				</Pressable>
			)}
		</View>
	);
}
