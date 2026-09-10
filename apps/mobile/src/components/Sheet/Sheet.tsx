import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tokens } from "../../theme/tokens";
import { usePalette } from "../../theme/usePalette";

export type SheetProps = {
	// The title line at the top of the panel. It is plain text, so a screen
	// reader lists only the panel's own headings.
	title: string;
	// The test id of the panel. The view that keeps the panel above the
	// keyboard carries `<testID>-keyboard`.
	testID: string;
	onClose: () => void;
	children: ReactNode;
};

const styles = StyleSheet.create({
	fill: { flex: 1 },
	scrim: { flex: 1, justifyContent: "flex-end" },
	panel: {
		borderTopLeftRadius: tokens.radius.xl,
		borderTopRightRadius: tokens.radius.xl,
		paddingTop: tokens.space[3],
		gap: tokens.space[2],
	},
	title: {
		fontSize: tokens.text.sm,
		lineHeight: tokens.leading.sm,
		fontWeight: "500",
		paddingHorizontal: tokens.space[4],
	},
});

// A panel that slides up from the bottom over a scrim. A tap on the scrim
// closes it. The panel keeps the bottom safe-area inset. The parent mounts
// the sheet while it is open. The modal fills the window, so on iOS the
// bottom padding of the KeyboardAvoidingView equals the keyboard height, and
// a field in the panel stays above the keyboard.
export function Sheet({ title, testID, onClose, children }: SheetProps) {
	const palette = usePalette();
	const { bottom } = useSafeAreaInsets();
	return (
		<Modal visible transparent animationType="slide" onRequestClose={onClose}>
			<KeyboardAvoidingView
				testID={`${testID}-keyboard`}
				behavior={Platform.OS === "ios" ? "padding" : undefined}
				style={styles.fill}
			>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel="Close"
					onPress={onClose}
					style={[styles.scrim, { backgroundColor: palette.scrim }]}
				>
					<Pressable
						testID={testID}
						onPress={() => {}}
						style={[styles.panel, { backgroundColor: palette.elevated, paddingBottom: bottom + tokens.space[4] }]}
					>
						<Text style={[styles.title, { color: palette.fgMuted }]}>{title}</Text>
						<View>{children}</View>
					</Pressable>
				</Pressable>
			</KeyboardAvoidingView>
		</Modal>
	);
}
