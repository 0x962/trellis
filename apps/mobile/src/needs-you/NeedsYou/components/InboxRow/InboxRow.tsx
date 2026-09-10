import { Ionicons } from "@expo/vector-icons";
import type { Check, TicketSummary } from "@trellis/api";
import { StyleSheet, Text } from "react-native";
import { ActorChip } from "../../../../components/ActorChip";
import { CheckRibbon, type Check as RibbonCheck } from "../../../../components/CheckRibbon";
import { Chip } from "../../../../components/Chip";
import { Row } from "../../../../components/Row";
import { StatusIcon } from "../../../../components/StatusIcon";
import { compactRelativeTime } from "../../../../lib/format";
import { layout } from "../../../../theme/layout";
import { tokens } from "../../../../theme/tokens";
import { usePalette } from "../../../../theme/usePalette";

export type InboxRowProps = {
	ticket: TicketSummary;
	// The checks of the linked pull requests. A Failing CI row names the
	// failing ones on its meta line.
	checks?: readonly Check[];
	onPress?: () => void;
};

const styles = StyleSheet.create({
	failing: { flexShrink: 1, fontSize: tokens.text.sm, lineHeight: tokens.leading.sm },
	arrow: { fontSize: tokens.text.xs, lineHeight: tokens.leading.xs },
});

// The mini ribbon draws the badge counts: every passing check, then every
// failing one, then every pending one.
const badgeChecks = (pr: NonNullable<TicketSummary["pr"]>): RibbonCheck[] => [
	...Array.from({ length: pr.pass }, () => ({ name: "check", bucket: "pass" as const })),
	...Array.from({ length: pr.fail }, () => ({ name: "check", bucket: "fail" as const })),
	...Array.from({ length: pr.pending }, () => ({ name: "check", bucket: "pending" as const })),
];

const failingNames = (checks: readonly Check[]) =>
	checks.filter((check) => check.bucket === "fail" || check.bucket === "cancel").map((check) => check.name);

// One ticket in a Needs you section. Every row has the same height, so
// FlashList never measures. The meta line holds the pull request ribbon,
// the failing check names, the parent, and the last actor. The system
// actor is the poller and never shows.
export function InboxRow({ ticket, checks, onPress }: InboxRowProps) {
	const palette = usePalette();
	const { status, pr, parent, lastActor } = ticket;
	const failing = checks === undefined ? [] : failingNames(checks);
	const progress = ticket.childCount > 0 ? ticket.childDoneCount / ticket.childCount : undefined;
	return (
		<Row
			testID={`inbox-row-${ticket.identifier}`}
			height={layout.inboxRow}
			id={ticket.identifier}
			title={ticket.title}
			leading={
				<StatusIcon
					category={status.category}
					reviewer={status.reviewer ?? undefined}
					progress={progress}
					label={status.name}
				/>
			}
			trailing={compactRelativeTime(ticket.updatedAt)}
			onPress={onPress}
			meta={
				<>
					{pr !== null && (
						<>
							<Ionicons name="git-pull-request-outline" size={tokens.text.sm} color={palette.fgFaint} />
							<CheckRibbon checks={badgeChecks(pr)} size="mini" />
						</>
					)}
					{failing.length > 0 && (
						<Text numberOfLines={1} style={[styles.failing, { color: palette.danger }]}>
							{failing.join(", ")}
						</Text>
					)}
					{parent !== null && (
						<Chip mono icon={<Text style={[styles.arrow, { color: palette.fgFaint }]}>↳</Text>}>
							{parent.identifier}
						</Chip>
					)}
					{lastActor !== null && lastActor.kind !== "system" && (
						<ActorChip name={lastActor.name} kind={lastActor.kind} muted />
					)}
				</>
			}
		/>
	);
}
