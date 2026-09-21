import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "../../../../components/Button";
import { Field } from "../../../../components/Field";
import { Sheet } from "../../../../components/Sheet";
import { tokens } from "../../../../theme/tokens";

export type SendBackSheetProps = {
	onConfirm: (reason: string) => void;
	onClose: () => void;
};

const styles = StyleSheet.create({
	body: { gap: tokens.space[3], paddingHorizontal: tokens.space[4] },
	actions: { flexDirection: "row", gap: tokens.space[2] },
	action: { flex: 1 },
});

// The sheet behind Send back: the field "Reason" and the buttons Cancel and
// Confirm. Confirm stays disabled while the field holds no text.
export function SendBackSheet({ onConfirm, onClose }: SendBackSheetProps) {
	const [reason, setReason] = useState("");
	const body = reason.trim();
	return (
		<Sheet title="Send back" testID="send-back-sheet" onClose={onClose}>
			<View style={styles.body}>
				<Field
					label="Reason"
					value={reason}
					onChangeText={setReason}
					placeholder="What has to change"
					autoCapitalize="sentences"
				/>
				<View style={styles.actions}>
					<View style={styles.action}>
						<Button label="Cancel" onPress={onClose} />
					</View>
					<View style={styles.action}>
						<Button label="Confirm" variant="primary" disabled={body.length === 0} onPress={() => onConfirm(body)} />
					</View>
				</View>
			</View>
		</Sheet>
	);
}
