import { eventApplierFor, type TicketSummary, type TicketUpdateInput, type TicketUpdateManyInput } from "@trellis/api";
import { toast } from "@trellis/ui";
import { useMemo } from "react";
import { useArchivedProjects } from "../../../../hooks/useArchivedProjects";
import { useApp } from "../../../../lib/appContext";
import { conflictCurrent, conflictMessage, errorMessage } from "../../../../lib/conflict";
import { patchRows, readRow } from "../../utils/cacheRows";

// The fields a table edit changes on a row before the server answers.
export type RowPatch = Partial<Pick<TicketSummary, "status" | "priority" | "project" | "parent">>;

type UpdateFields = Omit<TicketUpdateInput, "ticket" | "expectedVersion">;
type UpdateManyFields = Omit<TicketUpdateManyInput, "tickets">;

// The title of the rollback toast for a write, around its subject. The
// subject is an identifier, as in "CDE-51 did not move to Agent Review.",
// or a count, as in "2 tickets did not move to Agent Review.".
export type Verb = (subject: string) => string;

export type TicketMutations = {
	// One row, optimistic, conditional on the row's version.
	update: (ticket: TicketSummary, fields: UpdateFields, patch: RowPatch, verb: Verb) => Promise<void>;
	// Many rows in one batch, optimistic.
	updateMany: (
		tickets: readonly TicketSummary[],
		fields: UpdateManyFields,
		patch: RowPatch,
		verb: Verb,
	) => Promise<void>;
	remove: (ticket: TicketSummary) => Promise<void>;
	removeMany: (tickets: readonly TicketSummary[]) => Promise<void>;
};

// A write from this page has no server batch. The applier reads the id
// only to group rows, so one fixed id serves every local write.
const localBatchId = "00000000000000000000000000";

// The optimistic writes of the table. A change lands in every cached list
// before the request leaves, the response replaces it, and a failure puts
// the old row back and offers a retry.
export const useTicketMutations = (): TicketMutations => {
	const { client, queryClient } = useApp();
	const { isArchived, notice } = useArchivedProjects();

	return useMemo(() => {
		const applier = eventApplierFor(queryClient);

		// The server refuses every write to a ticket under an archived
		// project. A list such as All tickets holds such tickets, so every
		// write checks its rows first. It sends nothing and names the project.
		const refused = (tickets: readonly TicketSummary[]) => {
			const archived = tickets.find((ticket) => isArchived(ticket.project.path));
			if (archived === undefined) return false;
			toast.error(notice(archived.project.path), { duration: 6000 });
			return true;
		};

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
			toast.error(title, {
				description: errorMessage(error),
				duration: 6000,
				action: { label: "Retry", onClick: retry },
			});

		const update: TicketMutations["update"] = async (ticket, fields, patch, verb) => {
			if (refused([ticket])) return;
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
				const conflict = conflictCurrent(error);
				applier.endMutation(current.id, conflict ?? undefined);
				// The row now holds the other actor's version. A retry would
				// write over it before the person reads it, so the toast
				// offers none.
				if (conflict !== null) {
					toast.error(conflictMessage(current.identifier), { duration: 6000 });
					return;
				}
				fail(verb(current.identifier), error, () => void update(current, fields, patch, verb));
			}
		};

		const updateMany: TicketMutations["updateMany"] = async (tickets, fields, patch, verb) => {
			if (refused(tickets)) return;
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
				fail(verb(`${originals.length} tickets`), error, () => void updateMany(originals, fields, patch, verb));
			}
		};

		const remove: TicketMutations["remove"] = async (ticket) => {
			if (refused([ticket])) return;
			try {
				await client.tickets.delete({ ticket: ticket.identifier });
				applySummary(ticket, true);
			} catch (error) {
				fail(`${ticket.identifier} is not deleted.`, error, () => void remove(ticket));
			}
		};

		const removeMany: TicketMutations["removeMany"] = async (tickets) => {
			if (refused(tickets)) return;
			try {
				await client.tickets.deleteMany({ tickets: tickets.map((ticket) => ticket.identifier) });
				for (const ticket of tickets) applySummary(ticket, true);
			} catch (error) {
				fail(`${tickets.length} tickets are not deleted.`, error, () => void removeMany(tickets));
			}
		};

		return { update, updateMany, remove, removeMany };
	}, [client, queryClient, isArchived, notice]);
};
