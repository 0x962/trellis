import type { TicketSummary, TicketUpdateManyInput } from "@trellis/api";
import { ConfirmDialog, toast } from "@trellis/ui";
import { type ReactNode, useRef, useState } from "react";
import { useArchivedProjects } from "../../../../hooks/useArchivedProjects";
import { useStableCallback } from "../../../../hooks/useStableCallback";
import { type RowPatcher, useTicketMutations, type Verb } from "../useTicketMutations";

// The fields one bulk write sends. The refs come from the rows, so the
// caller never spells `tickets`.
export type TicketUpdateManyPatch = Omit<TicketUpdateManyInput, "tickets">;

// A bulk write over more tickets than this asks the person first. A Cmd+A
// selection of a whole project passes it. A hand-picked range does not.
export const confirmAbove = 25;

export type BulkWriteOptions = {
	// Runs after `remove` deletes the tickets. The table and the board pass
	// the clear of their selection, because the deleted ids no longer exist.
	onDeleted?: () => void;
};

// What `update` puts in the cache before the server answers, and what the
// failure toast says. A caller that knows the new value of the field, such
// as `useApplyChange`, passes both.
export type BulkWriteCache = {
	row?: RowPatcher;
	verb?: Verb;
};

export type BulkWrite = {
	// Writes `patch` to every row. `words` names the action for the confirm
	// dialog, as in "Set the status to Done".
	update: (
		rows: readonly TicketSummary[],
		patch: TicketUpdateManyPatch,
		words: string,
		cache?: BulkWriteCache,
	) => Promise<void>;
	// Asks first, then deletes every row.
	remove: (rows: readonly TicketSummary[]) => Promise<void>;
	// The confirm dialog of this hook. Render it once inside the surface
	// that calls the hook. Without it `update` and `remove` wait forever.
	confirmDialog: ReactNode;
};

// One question on screen and the callback that takes its answer.
type Ask = {
	title: string;
	description: string;
	confirmLabel: string;
	danger: boolean;
	answer: (confirmed: boolean) => void;
};

const noRowPatch: RowPatcher = {};
const plural = (count: number) => `${count} ${count === 1 ? "ticket" : "tickets"}`;

// The one path of every bulk write in the web app. It skips the tickets of
// an archived project, asks before a large write, sends the rest in runs of
// 200 through the optimistic machinery of `useTicketMutations`, and reports
// what it changed.
//
// One rule decides the path of a write: a change over a selection comes
// here, a selection of one row included, and it sends no expected version,
// because the tickets of a selection can carry versions from several
// readers. An edit of one row that no selection holds goes through
// `mutations.update` instead, which sends the version of that row and
// reports a conflict.
export const useBulkWrite = (options?: BulkWriteOptions): BulkWrite => {
	const mutations = useTicketMutations();
	const { isArchived, notice } = useArchivedProjects();
	const [ask, setAsk] = useState<Ask | null>(null);
	// The question on screen. A caller waits for its answer.
	const pending = useRef<Ask | null>(null);

	const request = (question: Omit<Ask, "answer">) =>
		new Promise<boolean>((resolve) => {
			// A second question replaces the one on screen. The caller behind
			// the first one reads a no, so its promise settles and its write
			// stops.
			pending.current?.answer(false);
			const next: Ask = {
				...question,
				answer: (confirmed) => {
					pending.current = null;
					setAsk(null);
					resolve(confirmed);
				},
			};
			pending.current = next;
			setAsk(next);
		});

	const update: BulkWrite["update"] = useStableCallback(async (rows, patch, words, cache) => {
		// The server refuses a write to a ticket under an archived project.
		// The rest of the selection still changes, and the toast counts the
		// tickets that stay as they are.
		const archived = rows.filter((row) => isArchived(row.project.path));
		const writable = rows.filter((row) => !isArchived(row.project.path));
		if (writable.length === 0) {
			if (archived.length > 0) toast.error(notice(archived[0]!.project.path), { duration: 6000 });
			return;
		}
		if (writable.length > confirmAbove) {
			const confirmed = await request({
				title: `Change ${writable.length} tickets?`,
				description: `${words} on every selected ticket. trellis cannot undo a bulk write.`,
				confirmLabel: "Change",
				danger: false,
			});
			if (!confirmed) return;
		}
		if (archived.length > 0) {
			toast(`${plural(archived.length)} are under an archived project. trellis leaves them as they are.`);
		}
		const verb: Verb = cache?.verb ?? ((subject) => `${subject} did not change.`);
		await mutations.updateMany(writable, patch, cache?.row ?? noRowPatch, verb);
	});

	const remove: BulkWrite["remove"] = useStableCallback(async (rows) => {
		if (rows.length === 0) return;
		const confirmed = await request({
			title: rows.length === 1 ? `Delete ${rows[0]!.identifier}?` : `Delete ${rows.length} tickets?`,
			description: "trellis cannot restore a deleted ticket. Its sub-tickets stay and lose their parent.",
			confirmLabel: "Delete",
			danger: true,
		});
		if (!confirmed) return;
		if (rows.length === 1) await mutations.remove(rows[0]!);
		else await mutations.removeMany(rows);
		options?.onDeleted?.();
	});

	const confirmDialog = (
		<ConfirmDialog
			open={ask !== null}
			title={ask?.title ?? ""}
			description={ask?.description ?? ""}
			confirmLabel={ask?.confirmLabel ?? ""}
			danger={ask?.danger ?? false}
			onConfirm={() => ask?.answer(true)}
			onCancel={() => ask?.answer(false)}
		/>
	);

	return { update, remove, confirmDialog };
};
