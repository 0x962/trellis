import { useQueryClient } from "@tanstack/react-query";
import type { TimelineListOutput } from "@trellis/api";
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "../../components/Button";
import { getClient } from "../../lib/orpc";
import { layout } from "../../theme/layout";
import { tokens } from "../../theme/tokens";
import { usePalette } from "../../theme/usePalette";
import { ticketDetailKey, timelineKey } from "../ticketQueries";

export type ComposerProps = {
	// The identifier of the ticket the comment goes to.
	ticket: string;
};

const styles = StyleSheet.create({
	// The tab bar stays under a pushed ticket and holds the bottom safe-area
	// inset, so the composer adds only its own spacing.
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

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

// The plain text field "Add a comment" and the Send button at the bottom of
// the screen. Send is disabled while the field holds no text. A posted
// comment goes to the top of the cached timeline page at once, and the
// ticket detail refetches, because a comment bumps the ticket's version.
// A failed post keeps the text in the field and shows the server message
// with Retry above the field.
export function Composer({ ticket }: ComposerProps) {
	const palette = usePalette();
	const queryClient = useQueryClient();
	const [text, setText] = useState("");
	const [busy, setBusy] = useState(false);
	const [failure, setFailure] = useState<string>();
	const body = text.trim();

	// The post is a network call that a person starts, so a failure is
	// caught here and shown, and the person decides what to do next.
	const send = async () => {
		setBusy(true);
		setFailure(undefined);
		try {
			const comment = await getClient().comments.create({ ticket, body });
			queryClient.setQueryData<TimelineListOutput>(timelineKey(ticket), (page) =>
				page === undefined ? page : { ...page, items: [{ kind: "comment", ...comment }, ...page.items] },
			);
			void queryClient.invalidateQueries({ queryKey: ticketDetailKey(ticket) });
			setText("");
		} catch (error) {
			setFailure(messageOf(error));
		}
		setBusy(false);
	};

	return (
		<View testID="composer" style={[styles.composer, { backgroundColor: palette.bg, borderTopColor: palette.border }]}>
			{failure !== undefined && (
				<View style={[styles.failure, { backgroundColor: palette.dangerSoft }]}>
					<View style={styles.lines}>
						<Text style={[styles.failureTitle, { color: palette.danger }]}>Cannot post the comment</Text>
						<Text style={[styles.failureDetail, { color: palette.fgMuted }]}>{failure}</Text>
					</View>
					<Button label="Retry" disabled={busy || body.length === 0} onPress={() => void send()} />
				</View>
			)}
			<View style={styles.bar}>
				<TextInput
					accessibilityLabel="Add a comment"
					placeholder="Add a comment"
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
