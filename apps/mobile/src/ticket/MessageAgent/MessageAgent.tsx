import { useQuery } from "@tanstack/react-query";
import { type AgentRun, messageTarget } from "@trellis/api";
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "../../components/Button";
import { describeError } from "../../lib/describeError";
import { getClient, getQueries } from "../../lib/orpc";
import { keys, store } from "../../lib/store";
import { layout } from "../../theme/layout";
import { tokens } from "../../theme/tokens";
import { usePalette } from "../../theme/usePalette";
export type MessageAgentProps = {
	// The identifier of the ticket whose agent gets the message.
	ticket: string;
};

const styles = StyleSheet.create({
	// The tab bar stays under a pushed ticket and holds the bottom safe-area
	// inset, so the form adds only its own spacing.
	composer: { borderTopWidth: layout.stroke, paddingBottom: tokens.space[2] },
	failure: {
		flexDirection: "row",
		alignItems: "center",
		gap: tokens.space[3],
		paddingHorizontal: tokens.space[4],
		paddingVertical: tokens.space[2],
	},
	lines: { flex: 1, gap: tokens.space.half },
	failureTitle: { fontSize: tokens.text.base, lineHeight: tokens.leading.base, fontWeight: "500" },
	failureDetail: { fontSize: tokens.text.sm, lineHeight: tokens.leading.sm },
	bar: {
		flexDirection: "row",
		alignItems: "flex-end",
		gap: tokens.space[2],
		paddingHorizontal: tokens.space[4],
		paddingTop: tokens.space[2],
	},
	input: {
		flex: 1,
		minHeight: layout.hit,
		maxHeight: layout.hit * 3,
		paddingHorizontal: tokens.space[3],
		paddingVertical: tokens.space[3],
		borderRadius: tokens.radius.md,
		borderWidth: layout.stroke,
		fontSize: tokens.text.md,
	},
});

// The plain text field "Message the agent" and the Send button at the bottom
// of the screen, shown while the ticket's assigned agent runs. The text
// reaches the agent the way `trellis agents send` sends it. Send is disabled
// while the field holds no text. A failed send keeps the text in the field
// and shows the server message with Retry above the field.
export function MessageAgent({ ticket }: MessageAgentProps) {
	const runs = useQuery({
		...getQueries().agentRuns.list.queryOptions({ input: { ticket } }),
		refetchInterval: 5000,
	});
	const target = runs.data === undefined ? null : messageTarget(runs.data);
	if (target === null) return null;
	return <MessageForm key={target.id} run={target} />;
}

function MessageForm({ run }: { run: AgentRun }) {
	const palette = usePalette();
	const [text, setText] = useState("");
	const [busy, setBusy] = useState(false);
	const [failure, setFailure] = useState<string>();
	const body = text.trim();

	// The send is a network call that a person starts, so a failure is
	// caught here and shown, and the person decides what to do next.
	const send = async () => {
		setBusy(true);
		setFailure(undefined);
		try {
			await getClient().agentRuns.send({ id: run.id, text: body });
			setText("");
		} catch (error) {
			setFailure(describeError(error, store.getString(keys.serverUrl)!).detail);
		}
		setBusy(false);
	};

	return (
		<View
			testID="message-agent"
			style={[styles.composer, { backgroundColor: palette.bg, borderTopColor: palette.border }]}
		>
			{failure !== undefined && (
				<View style={[styles.failure, { backgroundColor: palette.dangerSoft }]}>
					<View style={styles.lines}>
						<Text style={[styles.failureTitle, { color: palette.danger }]}>Cannot send the message</Text>
						<Text style={[styles.failureDetail, { color: palette.fgMuted }]}>{failure}</Text>
					</View>
					<Button label="Retry" disabled={busy || body.length === 0} onPress={() => void send()} />
				</View>
			)}
			<View style={styles.bar}>
				<TextInput
					accessibilityLabel={`Message ${run.name}`}
					placeholder={`Message ${run.name}`}
					placeholderTextColor={palette.fgFaint}
					value={text}
					onChangeText={setText}
					multiline
					editable={!busy}
					style={[
						styles.input,
						{ color: palette.fg, backgroundColor: palette.surface, borderColor: palette.borderStrong },
					]}
				/>
				<Button label="Send" variant="primary" disabled={body.length === 0 || busy} onPress={() => void send()} />
			</View>
		</View>
	);
}
