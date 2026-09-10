import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "../../../../components/Button";
import { layout } from "../../../../theme/layout";
import { tokens } from "../../../../theme/tokens";
import { usePalette } from "../../../../theme/usePalette";

export type SendBackSheetProps = {
	identifier: string;
	visible: boolean;
	onCancel: () => void;
	// The comment text. The sheet enables Send back once the text holds a character.
	onSubmit: (comment: string) => void;
};

export const prompt = "What should change?";

const styles = StyleSheet.create({
	scrim: { flex: 1, justifyContent: "flex-end" },
	sheet: {
		gap: tokens.space[3],
		padding: tokens.space[4],
		paddingBottom: tokens.space[8],
		borderTopLeftRadius: tokens.radius.xl,
		borderTopRightRadius: tokens.radius.xl,
	},
	title: { fontSize: tokens.text.lg, lineHeight: tokens.leading.lg, fontWeight: "600" },
	input: {
		minHeight: layout.hit * 2,
		padding: tokens.space[3],
		borderRadius: tokens.radius.md,
		borderWidth: layout.stroke,
		fontSize: tokens.text.md,
		lineHeight: tokens.leading.md,
		textAlignVertical: "top",
	},
	actions: { flexDirection: "row", gap: tokens.space[2] },
	action: { flex: 1 },
});

// The comment a person leaves when a ticket goes back to the agent. The
// comment posts before the move, so the agent reads why on its next turn.
export function SendBackSheet({ identifier, visible, onCancel, onSubmit }: SendBackSheetProps) {
	const palette = usePalette();
	const [text, setText] = useState("");
	const comment = text.trim();

	useEffect(() => {
		if (!visible) setText("");
	}, [visible]);

	if (!visible) return null;
	return (
		<Modal visible transparent animationType="slide" onRequestClose={onCancel}>
			<KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.scrim}>
				<Pressable
					accessibilityLabel="Close"
					onPress={onCancel}
					style={[styles.scrim, { backgroundColor: palette.scrim }]}
				/>
				<View style={[styles.sheet, { backgroundColor: palette.elevated }]}>
					<Text style={[styles.title, { color: palette.fg }]}>Send back {identifier}</Text>
					<TextInput
						accessibilityLabel="Comment"
						autoFocus
						multiline
						value={text}
						onChangeText={setText}
						placeholder={prompt}
						placeholderTextColor={palette.fgFaint}
						style={[
							styles.input,
							{ color: palette.fg, backgroundColor: palette.surface, borderColor: palette.borderStrong },
						]}
					/>
					<View style={styles.actions}>
						<View style={styles.action}>
							<Button label="Cancel" onPress={onCancel} />
						</View>
						<View style={styles.action}>
							<Button
								label="Send back"
								variant="primary"
								disabled={comment.length === 0}
								onPress={() => onSubmit(comment)}
							/>
						</View>
					</View>
				</View>
			</KeyboardAvoidingView>
		</Modal>
	);
}
