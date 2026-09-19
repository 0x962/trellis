import { eventApplierFor, type TicketSummary, type TicketUpdateInput, type TicketUpdateManyInput } from "@trellis/api";
import { toast } from "@trellis/ui";
import { useMemo } from "react";
import { useArchivedProjects } from "../../../../hooks/useArchivedProjects";
import { useApp } from "../../../../lib/appContext";
import { batchesOf } from "../../../../lib/batches";
import { conflictCurrent, conflictMessage, errorMessage } from "../../../../lib/conflict";
import { failToast } from "../../../../lib/failToast";
import { patchRows, readRow } from "../../utils/cacheRows";

// The fields a table edit changes on a row before the server answers.
export type RowPatch = Partial<
	Pick<TicketSummary, "status" | "priority" | "project" | "parent" | "epic" | "milestone" | "labels">
>;

// The patch of one write. A label toggle reads the row it changes, because
// the new label set depends on the labels that row holds now.
export type RowPatcher = RowPatch | ((row: TicketSummary) => RowPatch);

export type UpdateOptions = {
	// False sends no `expectedVersion`. Adds and removes of one label commute,
	// so two fast toggles of the same row must not fail with VERSION_CONFLICT.
	expectVersion: boolean;
};

type UpdateFields = Omit<TicketUpdateInput, "ticket" | "expectedVersion">;
type UpdateManyFields = Omit<TicketUpdateManyInput, "tickets">;

// The title of the rollback toast for a write, around its subject. The
// subject is an identifier, as in "CDE-51 did not move to Agent Review.",
// or a count, as in "2 tickets did not move to Agent Review.".
export type Verb = (subject: string) => string;

export type TicketMutations = {
	// One row, optimistic. The write is conditional on the row's version
	// unless `options` turns that off.
	update: (
		ticket: TicketSummary,
		fields: UpdateFields,
		patch: RowPatcher,
		verb: Verb,
		options?: UpdateOptions,
	) => Promise<void>;
	// Many rows in one batch, optimistic.
	updateMany: (
		tickets: readonly TicketSummary[],
		fields: UpdateManyFields,
		patch: RowPatcher,
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
		// project. A search result list holds such tickets, so every
		// write checks its rows first. It sends nothing and names the project.
		const refused = (tickets: readonly TicketSummary[]) => {
			const archived = tickets.find((ticket) => isArchived(ticket.project.path));
			if (archived === undefined) return false;
			toast.error(notice(archived.project.path), { duration: 6000 });
			return true;
		};

		const patched = (row: TicketSummary, patch: RowPatcher): TicketSummary => ({
			...row,
			...(typeof patch === "function" ? patch(row) : patch),
		});

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

		const update: TicketMutations["update"] = async (ticket, fields, patch, verb, options) => {
			if (refused([ticket])) return;
			const expectVersion = options?.expectVersion ?? true;
			const current = readRow(queryClient, ticket.id) ?? ticket;
			patchRows(queryClient, new Set([current.id]), (row) => patched(row, patch));
			applier.beginMutation(current.id);
			try {
				const result = await client.tickets.update({
					ticket: current.identifier,
					...fields,
					...(expectVersion ? { expectedVersion: current.version } : {}),
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
				failToast(verb(current.identifier), error, () => void update(current, fields, patch, verb, options));
			}
		};

		// The server takes 200 refs per call, so a larger set becomes several
		// calls in order. Each call is its own transaction. When one call
		// fails, the rows of that call and of every call after it go back to
		// the value they had, and the rows of the calls that already answered
		// keep the value the server sent.
		const updateMany: TicketMutations["updateMany"] = async (tickets, fields, patch, verb) => {
			if (refused(tickets)) return;
			const originals = tickets.map((ticket) => readRow(queryClient, ticket.id) ?? ticket);
			patchRows(queryClient, new Set(originals.map((row) => row.id)), (row) => patched(row, patch));
			const runs = batchesOf(originals);
			let changed = 0;
			for (const [index, run] of runs.entries()) {
				try {
					const { items } = await client.tickets.updateMany({
						tickets: run.map((row) => row.identifier),
						...fields,
					});
					for (const item of items) applySummary(item);
					changed += run.length;
				} catch (error) {
					revert(runs.slice(index).flat());
					if (changed === 0) {
						failToast(
							verb(`${originals.length} tickets`),
							error,
							() => void updateMany(originals, fields, patch, verb),
						);
						return;
					}
					// A retry would write the whole set again, over the rows
					// the earlier calls already changed, so the toast offers none.
					toast.error(`${changed} of ${originals.length} tickets changed.`, {
						description: errorMessage(error),
						duration: 6000,
					});
					return;
				}
			}
		};

		const remove: TicketMutations["remove"] = async (ticket) => {
			if (refused([ticket])) return;
			try {
				await client.tickets.delete({ ticket: ticket.identifier });
				applySummary(ticket, true);
			} catch (error) {
				failToast(`${ticket.identifier} is not deleted.`, error, () => void remove(ticket));
			}
		};

		const removeMany: TicketMutations["removeMany"] = async (tickets) => {
			if (refused(tickets)) return;
			const runs = batchesOf(tickets);
			let deleted = 0;
			for (const run of runs) {
				try {
					await client.tickets.deleteMany({ tickets: run.map((ticket) => ticket.identifier) });
					for (const ticket of run) applySummary(ticket, true);
					deleted += run.length;
				} catch (error) {
					if (deleted === 0) {
						failToast(`${tickets.length} tickets are not deleted.`, error, () => void removeMany(tickets));
						return;
					}
					toast.error(`${deleted} of ${tickets.length} tickets are deleted.`, {
						description: errorMessage(error),
						duration: 6000,
					});
					return;
				}
			}
		};

		return { update, updateMany, remove, removeMany };
	}, [client, queryClient, isArchived, notice]);
};
