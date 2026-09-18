import { useMutation } from "@tanstack/react-query";
import type { EpicSummary } from "@trellis/api";
import { ConfirmDialog } from "@trellis/ui";
import { useApp } from "../../../lib/appContext";
import { failToast } from "../../../lib/failToast";
import { formatCount } from "../../../lib/format";

export type DeleteEpicDialogProps = {
	epic: EpicSummary;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	// Runs after the server confirms the delete.
	onDeleted?: () => void;
};

const ticketCount = (count: number) => `${formatCount(count)} ${count === 1 ? "ticket" : "tickets"}`;

// A delete of the epic record. The tickets of the epic stay and leave the
// epic; the server writes that change on every one of them. A delete cannot
// be undone, so the dialog asks first.
export function DeleteEpicDialog({ epic, open, onOpenChange, onDeleted }: DeleteEpicDialogProps) {
	const { client, orpc, queryClient } = useApp();
	const remove = useMutation({
		mutationFn: () => client.epics.delete({ epic: epic.ref }),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: orpc.epics.key() });
			await queryClient.invalidateQueries({ queryKey: orpc.projects.key() });
			onOpenChange(false);
			onDeleted?.();
		},
		onError: (error) => failToast(`${epic.name} is not deleted.`, error, () => remove.mutate()),
	});
	const description =
		epic.counts.total === 0
			? `${epic.name} holds no tickets. You cannot undo a delete.`
			: `The ${ticketCount(epic.counts.total)} of ${epic.name} stay and leave the epic. You cannot undo a delete.`;

	return (
		<ConfirmDialog
			open={open}
			title={`Delete ${epic.name}?`}
			description={description}
			confirmLabel="Delete epic"
			danger
			processing={remove.isPending}
			onCancel={() => onOpenChange(false)}
			onConfirm={() => remove.mutate()}
		/>
	);
}
