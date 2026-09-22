import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { Priority, Status, Ticket } from "@trellis/api";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../../components/Button";
import { SectionHeader } from "../../components/SectionHeader";
import { getClient } from "../../lib/orpc";
import { keys, store } from "../../lib/store";
import { tokens } from "../../theme/tokens";
import { usePalette } from "../../theme/usePalette";
import { Attachments } from "../Attachments";
import { Description } from "../Description";
import { PrCard } from "../PrCard";
import { PrioritySheet } from "../PrioritySheet";
import { PropertyGrid } from "../PropertyGrid";
import { ReviewActions } from "../ReviewActions";
import { approveTarget, sendBackTarget } from "../reviewTargets";
import { StatusSheet } from "../StatusSheet";
import { SubTickets } from "../SubTickets";
import { Timeline, timelineRows } from "../Timeline";
import {
	approve,
	priorityInput,
	sendBack,
	statusesQuery,
	statusInput,
	ticketDetailQuery,
	withPriority,
	withStatus,
} from "../ticketQueries";
import { timelineOptions } from "../timelineCache";
import { useTicketUpdate } from "../useTicketUpdate";

export type TicketViewProps = {
	ticket: Ticket;
};

const styles = StyleSheet.create({
	screen: { flex: 1 },
	title: {
		fontSize: tokens.text.xl,
		lineHeight: tokens.leading.xl,
		fontWeight: "600",
		paddingHorizontal: tokens.space[4],
		paddingTop: tokens.space[2],
	},
	message: {
		gap: tokens.space.half,
		paddingHorizontal: tokens.space[4],
		paddingVertical: tokens.space[2],
	},
	messageTitle: { fontSize: tokens.text.base, lineHeight: tokens.leading.base, fontWeight: "500" },
	messageDetail: { fontSize: tokens.text.sm, lineHeight: tokens.leading.sm },
	earlier: { paddingHorizontal: tokens.space[4], paddingTop: tokens.space[2] },
});

// The loaded ticket: every section above the timeline as the list header, and
// the timeline rows below it. The two sheets and the review actions write
// through one `useTicketUpdate`. The timeline shows the newest page first.
// While an older page exists, a Load earlier button under the oldest item
// reads it.
export function TicketView({ ticket }: TicketViewProps) {
	const palette = usePalette();
	const client = getClient();
	const { identifier } = ticket;
	const statuses = useQuery(statusesQuery(client, ticket.project.id)).data?.statuses ?? [];
	const timeline = useInfiniteQuery(timelineOptions(identifier));
	const items = timeline.data?.pages.flatMap((page) => page.items) ?? [];
	const parent = useQuery({
		...ticketDetailQuery(client, ticket.parent?.identifier ?? ""),
		enabled: ticket.parent !== null,
	});
	const { run, failure } = useTicketUpdate(identifier);
	const [statusOpen, setStatusOpen] = useState(false);
	const [priorityOpen, setPriorityOpen] = useState(false);

	const chooseStatus = (status: Status) => {
		setStatusOpen(false);
		void run(withStatus(ticket, status), () => client.tickets.update(statusInput(ticket, status)));
	};
	const choosePriority = (priority: Priority) => {
		setPriorityOpen(false);
		void run(withPriority(ticket, priority), () => client.tickets.update(priorityInput(ticket, priority)));
	};
	const onApprove = () => {
		void run(withStatus(ticket, approveTarget(statuses, ticket.status)), () => approve(client, ticket, statuses));
	};
	const onSendBack = (reason: string) => {
		void run(withStatus(ticket, sendBackTarget(statuses)), () => sendBack(client, ticket, statuses, reason));
	};

	const header = (
		<View>
			<Text style={[styles.title, { color: palette.fg }]}>{ticket.title}</Text>
			{statuses.length > 0 && <ReviewActions ticket={ticket} onApprove={onApprove} onSendBack={onSendBack} />}
			<PropertyGrid
				ticket={ticket}
				parentTitle={parent.data?.title}
				onStatusPress={() => setStatusOpen(true)}
				onPriorityPress={() => setPriorityOpen(true)}
			/>
			<Description markdown={ticket.description} stale={ticket.descriptionStale === true} />
			<SubTickets tickets={ticket.children} />
			{ticket.prs.length > 0 && <SectionHeader label="Pull requests" count={ticket.prs.length} />}
			{ticket.prs.map((pr) => (
				<PrCard key={pr.id} pr={pr} />
			))}
			<Attachments attachments={ticket.attachments} serverUrl={store.getString(keys.serverUrl)!} />
			<SectionHeader label="Timeline" />
		</View>
	);

	const footer = timeline.hasNextPage ? (
		<View style={styles.earlier}>
			<Button
				label="Load earlier"
				disabled={timeline.isFetchingNextPage}
				onPress={() => void timeline.fetchNextPage()}
			/>
		</View>
	) : undefined;

	return (
		<View testID="ticket-screen" style={styles.screen}>
			{failure !== undefined && (
				<View style={[styles.message, { backgroundColor: palette.dangerSoft }]}>
					<Text style={[styles.messageTitle, { color: palette.danger }]}>{failure.title}</Text>
					<Text style={[styles.messageDetail, { color: palette.fgMuted }]}>{failure.detail}</Text>
				</View>
			)}
			<Timeline rows={timelineRows(items)} header={header} footer={footer} />
			<StatusSheet
				open={statusOpen}
				statuses={statuses}
				currentId={ticket.status.id}
				onChoose={chooseStatus}
				onClose={() => setStatusOpen(false)}
			/>
			<PrioritySheet
				open={priorityOpen}
				current={ticket.priority}
				onChoose={choosePriority}
				onClose={() => setPriorityOpen(false)}
			/>
		</View>
	);
}
