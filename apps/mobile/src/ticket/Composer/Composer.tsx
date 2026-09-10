import { useQueryClient } from "@tanstack/react-query";
import type { TimelineListOutput } from "@trellis/api";
import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
	bar: {
		flexDirection: "row",
		alignItems: "flex-end",
		gap: tokens.space[2],
		paddingHorizontal: tokens.space[4],
		paddingTop: tokens.space[2],
		borderTopWidth: layout.stroke,
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

// The plain text field "Add a comment" and the Send button at the bottom of
// the screen. Send is disabled while the field holds no text. A posted
// comment goes to the top of the cached timeline page at once, and the
// ticket detail refetches, because a comment bumps the ticket's version.
export function Composer({ ticket }: ComposerProps) {
	const palette = usePalette();
	const { bottom } = useSafeAreaInsets();
	const queryClient = useQueryClient();
	const [text, setText] = useState("");
	const [busy, setBusy] = useState(false);
	const body = text.trim();

	const send = async () => {
		setBusy(true);
		const comment = await getClient().comments.create({ ticket, body });
		queryClient.setQueryData<TimelineListOutput>(timelineKey(ticket), (page) =>
			page === undefined ? page : { ...page, items: [{ kind: "comment", ...comment }, ...page.items] },
		);
		void queryClient.invalidateQueries({ queryKey: ticketDetailKey(ticket) });
		setText("");
		setBusy(false);
	};

	return (
		<View
			style={[
				styles.bar,
				{ backgroundColor: palette.bg, borderTopColor: palette.border, paddingBottom: bottom + tokens.space[2] },
			]}
		>
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
	);
}
