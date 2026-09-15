import { ORPCError } from "@orpc/client";
import { useQueryClient } from "@tanstack/react-query";
import { eventApplierFor, type Ticket, type TicketSummary } from "@trellis/api";
import * as Haptics from "expo-haptics";
import { useCallback, useRef, useState } from "react";
import { getClient } from "../../../../lib/orpc";
import { approve, type SendBackProgress, sendBack } from "../../utils/approve";
import { type DroppedRow, dropInboxRow, restoreInboxRow } from "../../utils/inboxCache";

export type ToastState = {
	tone: "error" | "success";
	title: string;
	detail?: string;
	action?: { label: string; onPress: () => void };
};

export type InboxActions = {
	// The ids of the rows that are on their way out of the list.
	leaving: ReadonlySet<string>;
	toast: ToastState | undefined;
	dismissToast: () => void;
	// The ticket whose send-back sheet is open.
	sendBackFor: TicketSummary | undefined;
	approveRow: (ticket: TicketSummary) => void;
	openSendBack: (ticket: TicketSummary) => void;
	cancelSendBack: () => void;
	submitSendBack: (comment: string) => void;
	// Runs when a leaving row has finished its sweep and can leave the cache.
	onRowRemoved: (id: string) => void;
};

// One write in flight for one ticket. `dropped` is set once the row's sweep
// has ended and the row has left the cache, so a failure can put it back.
type Flight = { dropped?: DroppedRow };

const summaryOf = ({ description, children, prs, attachments, descriptionStale, ...summary }: Ticket): TicketSummary =>
	summary;

// The current ticket a VERSION_CONFLICT carries, or undefined for any other error.
const conflictCurrent = (error: unknown): Ticket | undefined =>
	error instanceof ORPCError && error.code === "VERSION_CONFLICT"
		? (error.data as { current: Ticket }).current
		: undefined;

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

const without = (set: ReadonlySet<string>, id: string) => {
	const next = new Set(set);
	next.delete(id);
	return next;
};

// The approve and send-back flows of the Needs you tab. A row leaves the list
// as soon as the person acts: it sweeps out, then `onRowRemoved` drops it
// from the cache. The write runs meanwhile. The live applier holds the
// ticket's events while the write is in flight, so the response and the
// events land in version order. A failed write puts the row back where it
// was, with the summary the server holds now, and shows a toast.
export const useInboxActions = (): InboxActions => {
	const queryClient = useQueryClient();
	const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set());
	const [toast, setToast] = useState<ToastState>();
	const [sendBackFor, setSendBackFor] = useState<TicketSummary>();
	const flights = useRef(new Map<string, Flight>());

	const run = useCallback(
		async (ticket: TicketSummary, write: () => Promise<Ticket>, failure: (current: TicketSummary) => ToastState) => {
			const applier = eventApplierFor(queryClient);
			const { id } = ticket;
			const flight: Flight = {};
			flights.current.set(id, flight);
			setLeaving((set) => new Set(set).add(id));
			applier.beginMutation(id);
			try {
				const result = await write();
				flights.current.delete(id);
				applier.endMutation(id, result);
			} catch (error) {
				flights.current.delete(id);
				const current = conflictCurrent(error);
				applier.endMutation(id, current);
				const summary = current === undefined ? ticket : summaryOf(current);
				if (flight.dropped !== undefined) restoreInboxRow(queryClient, flight.dropped, summary);
				setLeaving((set) => without(set, id));
				setToast({ ...failure(summary), detail: messageOf(error) });
			}
		},
		[queryClient],
	);

	const approveRow = useCallback(
		(ticket: TicketSummary) => {
			void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
			void run(
				ticket,
				() => approve(getClient(), ticket),
				(current) => ({
					tone: "error",
					title: `Cannot approve ${ticket.identifier}`,
					action: {
						label: "Retry",
						onPress: () => {
							setToast(undefined);
							approveRow(current);
						},
					},
				}),
			);
		},
		[run],
	);

	// The sheet is closed while the write runs, so the Retry of the toast
	// holds the comment. `progress` is shared by every run of one send back,
	// so a Retry after a posted comment sends the move only.
	const sendBackRow = useCallback(
		(ticket: TicketSummary, comment: string, progress: SendBackProgress) => {
			void run(
				ticket,
				() => sendBack(getClient(), ticket, comment, progress),
				(current) => ({
					tone: "error",
					title: `Cannot send back ${ticket.identifier}`,
					action: {
						label: "Retry",
						onPress: () => {
							setToast(undefined);
							sendBackRow(current, comment, progress);
						},
					},
				}),
			);
		},
		[run],
	);

	const submitSendBack = useCallback(
		(comment: string) => {
			const ticket = sendBackFor!;
			setSendBackFor(undefined);
			sendBackRow(ticket, comment, { posted: false });
		},
		[sendBackRow, sendBackFor],
	);

	const onRowRemoved = useCallback(
		(id: string) => {
			const dropped = dropInboxRow(queryClient, id);
			const flight = flights.current.get(id);
			if (flight !== undefined && dropped !== undefined) flight.dropped = dropped;
			setLeaving((set) => without(set, id));
		},
		[queryClient],
	);

	return {
		leaving,
		toast,
		dismissToast: useCallback(() => setToast(undefined), []),
		sendBackFor,
		approveRow,
		openSendBack: useCallback((ticket: TicketSummary) => setSendBackFor(ticket), []),
		cancelSendBack: useCallback(() => setSendBackFor(undefined), []),
		submitSendBack,
		onRowRemoved,
	};
};
