import Ionicons from "@expo/vector-icons/Ionicons";
import { type LinkedPullRequest, type PrState, readyForReview } from "@trellis/api";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { CheckRibbon } from "../../components/CheckRibbon";
import { compactRelativeTime } from "../../lib/time";
import { layout } from "../../theme/layout";
import { type Palette, tokens } from "../../theme/tokens";
import { usePalette } from "../../theme/usePalette";
import { checkCounts } from "./checkCounts";

export type PrCardProps = {
	pr: LinkedPullRequest;
};

type IconName = keyof typeof Ionicons.glyphMap;

const stateIcons: Record<PrState, IconName> = {
	open: "git-pull-request-outline",
	merged: "git-merge-outline",
	closed: "git-pull-request-outline",
};

const stateColors: Record<PrState, keyof Palette> = { open: "success", merged: "agent", closed: "danger" };

const pillColors: Record<string, [keyof Palette, keyof Palette]> = {
	pass: ["successSoft", "success"],
	fail: ["dangerSoft", "danger"],
	pending: ["warningSoft", "warning"],
	none: ["surface", "fgMuted"],
};

const reviewLabels: Record<string, string> = { approved: "Approved", changes_requested: "Changes requested" };

const styles = StyleSheet.create({
	card: {
		marginHorizontal: tokens.space[4],
		marginBottom: tokens.space[2],
		padding: tokens.space[3],
		gap: tokens.space[2],
		borderRadius: tokens.radius.lg,
		borderWidth: layout.stroke,
	},
	line: { flexDirection: "row", alignItems: "center", gap: tokens.space[2] },
	repo: { flex: 1, fontSize: tokens.text.sm, lineHeight: tokens.leading.sm },
	title: { fontSize: tokens.text.md, lineHeight: tokens.leading.md, fontWeight: "500" },
	pill: {
		flexDirection: "row",
		alignItems: "center",
		gap: tokens.space[1],
		height: tokens.space[5],
		paddingHorizontal: tokens.space[1] + tokens.space.half,
		borderRadius: tokens.radius.sm,
	},
	pillText: { fontSize: tokens.text.xs, lineHeight: tokens.leading.xs, fontVariant: ["tabular-nums"] },
	branch: { flex: 1, fontSize: tokens.text.xs, lineHeight: tokens.leading.xs },
	sub: { fontSize: tokens.text.xs, lineHeight: tokens.leading.xs },
});

// One linked pull request: the state, the repository and the number, the
// title, the branch pair, the check ribbon, the count pill, and the review
// chip. A tap opens the pull request in the system browser.
export function PrCard({ pr }: PrCardProps) {
	const palette = usePalette();
	const counts = checkCounts(pr.checks);
	const [pillBg, pillFg] = pillColors[counts.state]!;
	const stateColor = pr.state === "open" && !readyForReview(pr) ? palette.fgMuted : palette[stateColors[pr.state]];
	const review = reviewLabels[pr.reviewState];
	return (
		<Pressable
			accessibilityRole="link"
			onPress={() => void Linking.openURL(pr.url)}
			style={({ pressed }) => [
				styles.card,
				{ backgroundColor: pressed ? palette.elevated : palette.surface, borderColor: palette.border },
			]}
		>
			<View style={styles.line}>
				<Ionicons name={stateIcons[pr.state]} size={layout.statusIcon} color={stateColor} />
				<Text numberOfLines={1} style={[styles.repo, { color: palette.fgMuted }]}>
					{pr.owner}/{pr.repo} #{pr.number}
				</Text>
				<Ionicons name="open-outline" size={layout.mark} color={palette.fgFaint} />
			</View>
			<Text numberOfLines={2} style={[styles.title, { color: palette.fg }]}>
				{pr.title}
			</Text>
			<View style={styles.line}>
				<CheckRibbon checks={pr.checks} />
				<View accessibilityLabel={counts.label} style={[styles.pill, { backgroundColor: palette[pillBg] }]}>
					<Ionicons
						name={counts.state === "fail" ? "close" : counts.state === "pending" ? "ellipse-outline" : "checkmark"}
						size={tokens.text.xs}
						color={palette[pillFg]}
					/>
					<Text style={[styles.pillText, { color: palette[pillFg] }]}>
						{counts.state === "none" ? "No checks" : counts.pass + counts.fail + counts.pending}
					</Text>
				</View>
				{review !== undefined && (
					<View style={[styles.pill, { backgroundColor: palette.accentSoft }]}>
						<Text style={[styles.pillText, { color: palette.accent }]}>{review}</Text>
					</View>
				)}
			</View>
			<View style={styles.line}>
				<Text numberOfLines={1} style={[styles.branch, { color: palette.fgMuted }]}>
					{pr.headRef} → {pr.baseRef}
				</Text>
				<Text style={[styles.sub, { color: palette.fgFaint }]}>{compactRelativeTime(pr.updatedAt)}</Text>
			</View>
		</Pressable>
	);
}
