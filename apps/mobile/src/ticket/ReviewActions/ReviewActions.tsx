import type { Ticket } from "@trellis/api";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "../../components/Button";
import { tokens } from "../../theme/tokens";
import { showsReviewActions } from "../reviewTargets";
import { SendBackSheet } from "./components/SendBackSheet";

export type ReviewActionsProps = {
	ticket: Ticket;
	onApprove: () => void;
	onSendBack: (reason: string) => void;
};

const styles = StyleSheet.create({
	row: { flexDirection: "row", gap: tokens.space[2], paddingHorizontal: tokens.space[4], paddingTop: tokens.space[4] },
	action: { flex: 1 },
});

// Approve as the primary button and Send back beside it, shown only on a
// review status. Send back opens a sheet with the field "Reason" and the
// buttons Cancel and Confirm.
export function ReviewActions({ ticket, onApprove, onSendBack }: ReviewActionsProps) {
	const [asking, setAsking] = useState(false);
	if (!showsReviewActions(ticket.status)) return null;
	return (
		<View style={styles.row}>
			<View style={styles.action}>
				<Button label="Approve" variant="primary" onPress={onApprove} />
			</View>
			<View style={styles.action}>
				<Button label="Send back" onPress={() => setAsking(true)} />
			</View>
			{asking && (
				<SendBackSheet
					onConfirm={(reason) => {
						setAsking(false);
						onSendBack(reason);
					}}
					onClose={() => setAsking(false)}
				/>
			)}
		</View>
	);
}
