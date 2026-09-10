import type { ProjectSummary, StatusSummary, TicketSummary } from "@trellis/api";
import { useStableCallback } from "../../../../hooks/useStableCallback";
import type { RowChange } from "../../Row";
import type { useTicketMutations } from "../useTicketMutations";

type Mutations = ReturnType<typeof useTicketMutations>;

const summaryOf = (status: StatusSummary): StatusSummary => ({
	id: status.id,
	slug: status.slug,
	name: status.name,
	category: status.category,
	reviewer: status.reviewer,
	color: status.color,
});

// Applies one inline or bulk change to the target rows. One target writes
// through `mutations.update`; two or more write through `mutations.updateMany`.
// The callback identity is stable across renders.
export const useApplyChange = (mutations: Mutations, projects: readonly ProjectSummary[]) =>
	useStableCallback((targets: readonly TicketSummary[], change: RowChange) => {
		const many = targets.length > 1;
		if ("status" in change) {
			const status = summaryOf(change.status);
			return many
				? mutations.updateMany(targets, { status: status.id }, { status }, `move to ${status.name}`)
				: mutations.update(targets[0]!, { status: status.id }, { status }, `move to ${status.name}`);
		}
		if ("priority" in change) {
			const label = `set priority to ${change.priority}`;
			return many
				? mutations.updateMany(targets, { priority: change.priority }, { priority: change.priority }, label)
				: mutations.update(targets[0]!, { priority: change.priority }, { priority: change.priority }, label);
		}
		if ("project" in change) {
			const target = projects.find((entry) => entry.path === change.project);
			const patch = target === undefined ? {} : { project: { id: target.id, key: target.key, path: target.path } };
			return many
				? mutations.updateMany(targets, { project: change.project }, patch, `move to ${change.project}`)
				: mutations.update(targets[0]!, { project: change.project }, patch, `move to ${change.project}`);
		}
		const parent = change.parent === null ? null : { id: change.parent.id, identifier: change.parent.identifier };
		return many
			? mutations.updateMany(targets, { parent: parent?.identifier ?? null }, { parent }, "set the parent of")
			: mutations.update(targets[0]!, { parent: parent?.identifier ?? null }, { parent }, "set the parent of");
	});
