import type { Comment } from "@trellis/api";
import { StyleSheet, Text, View } from "react-native";
import { ActorChip } from "../../../../components/ActorChip";
import { compactRelativeTime } from "../../../../lib/time";
import { layout } from "../../../../theme/layout";
import { tokens } from "../../../../theme/tokens";
import { usePalette } from "../../../../theme/usePalette";
import { Markdown } from "../../../Markdown";

export type CommentCardProps = {
	comment: Comment;
};

const styles = StyleSheet.create({
	card: {
		marginHorizontal: tokens.space[4],
		marginBottom: tokens.space[2],
		paddingHorizontal: tokens.space[3],
		paddingVertical: tokens.space[2],
		borderRadius: tokens.radius.lg,
		borderWidth: layout.stroke,
		borderLeftWidth: tokens.space.half,
	},
	head: { flexDirection: "row", alignItems: "center", gap: tokens.space[2] },
	when: { marginLeft: "auto", fontSize: tokens.text.sm, lineHeight: tokens.leading.sm, fontVariant: ["tabular-nums"] },
});

// One comment: the actor line, the relative time, and the markdown body. An
// agent's card carries the agent color on its left edge, a human's the
// neutral border, so "who said what" reads while the list scrolls.
export function CommentCard({ comment }: CommentCardProps) {
	const palette = usePalette();
	const { actor } = comment;
	const agent = actor.kind === "agent";
	return (
		<View
			testID={`comment-${comment.id}`}
			style={[
				styles.card,
				{
					backgroundColor: palette.surface,
					borderColor: palette.border,
					borderLeftColor: agent ? palette.agent : palette.border,
				},
			]}
		>
			<View style={styles.head}>
				<ActorChip name={actor.name} kind={agent ? "agent" : "human"} />
				<Text style={[styles.when, { color: palette.fgFaint }]}>{compactRelativeTime(comment.createdAt)}</Text>
			</View>
			<Markdown source={comment.body} />
		</View>
	);
}
