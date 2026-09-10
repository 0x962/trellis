import { ORPCError } from "@orpc/client";
import {
	eventApplierFor,
	type Ticket,
	type TicketSummary,
	type TicketUpdateInput,
	type TicketUpdateManyInput,
} from "@trellis/api";
import { toast } from "@trellis/ui";
import { useMemo } from "react";
import { useApp } from "../../../../lib/appContext";
import { patchRows, readRow } from "../../utils/cacheRows";

// The fields a table edit changes on a row before the server answers.
export type RowPatch = Partial<Pick<TicketSummary, "status" | "priority" | "project" | "parent">>;

type UpdateFields = Omit<TicketUpdateInput, "ticket" | "expectedVersion">;
type UpdateManyFields = Omit<TicketUpdateManyInput, "tickets">;

export type TicketMutations = {
	// One row, optimistic, conditional on the row's version.
	update: (ticket: TicketSummary, fields: UpdateFields, patch: RowPatch, verb: string) => Promise<void>;
	// Many rows in one batch, optimistic.
	updateMany: (
		tickets: readonly TicketSummary[],
		fields: UpdateManyFields,
		patch: RowPatch,
		verb: string,
	) => Promise<void>;
	remove: (ticket: TicketSummary) => Promise<void>;
	removeMany: (tickets: readonly TicketSummary[]) => Promise<void>;
};

// A write from this page has no server batch. The applier reads the id
// only to group rows, so one fixed id serves every local write.
const localBatchId = "00000000000000000000000000";

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

// The optimistic writes of the table. A change lands in every cached list
// before the request leaves, the response replaces it, and a failure puts
// the old row back and offers a retry.
export const useTicketMutations = (): TicketMutations => {
	const { client, queryClient } = useApp();

	return useMemo(() => {
		const applier = eventApplierFor(queryClient);

		const applySummary = (summary: TicketSummary, deleted = false) =>
			applier.applyEvent({
				type: deleted ? "ticket.deleted" : "ticket.updated",
				summary,
				fields: [],
				batchId: localBatchId,
			});

		const revert = (originals: readonly TicketSummary[]) => {
			const byId = new Map(originals.map((row) => [row.id, row]));
			patchRows(queryClient, new Set(byId.keys()), (row) => byId.get(row.id) ?? row);
		};

		const fail = (title: string, error: unknown, retry: () => void) =>
			toast.error(title, { description: message(error), duration: 6000, action: { label: "Retry", onClick: retry } });

		const update: TicketMutations["update"] = async (ticket, fields, patch, verb) => {
			const current = readRow(queryClient, ticket.id) ?? ticket;
			patchRows(queryClient, new Set([current.id]), (row) => ({ ...row, ...patch }));
			applier.beginMutation(current.id);
			try {
				const result = await client.tickets.update({
					ticket: current.identifier,
					...fields,
					expectedVersion: current.version,
				});
				applier.endMutation(current.id, result);
			} catch (error) {
				revert([current]);
				const conflict = error instanceof ORPCError && error.code === "VERSION_CONFLICT";
				applier.endMutation(current.id, conflict ? (error.data as { current: Ticket }).current : undefined);
				fail(`Couldn't ${verb} ${current.identifier}`, error, () => void update(current, fields, patch, verb));
			}
		};

		const updateMany: TicketMutations["updateMany"] = async (tickets, fields, patch, verb) => {
			const originals = tickets.map((ticket) => readRow(queryClient, ticket.id) ?? ticket);
			patchRows(queryClient, new Set(originals.map((row) => row.id)), (row) => ({ ...row, ...patch }));
			try {
				const { items } = await client.tickets.updateMany({
					tickets: originals.map((row) => row.identifier),
					...fields,
				});
				for (const item of items) applySummary(item);
			} catch (error) {
				revert(originals);
				fail(
					`Couldn't ${verb} ${originals.length} tickets`,
					error,
					() => void updateMany(originals, fields, patch, verb),
				);
			}
		};

		const remove: TicketMutations["remove"] = async (ticket) => {
			try {
				await client.tickets.delete({ ticket: ticket.identifier });
				applySummary(ticket, true);
			} catch (error) {
				fail(`Couldn't delete ${ticket.identifier}`, error, () => void remove(ticket));
			}
		};

		const removeMany: TicketMutations["removeMany"] = async (tickets) => {
			try {
				await client.tickets.deleteMany({ tickets: tickets.map((ticket) => ticket.identifier) });
				for (const ticket of tickets) applySummary(ticket, true);
			} catch (error) {
				fail(`Couldn't delete ${tickets.length} tickets`, error, () => void removeMany(tickets));
			}
		};

		return { update, updateMany, remove, removeMany };
	}, [client, queryClient]);
};
