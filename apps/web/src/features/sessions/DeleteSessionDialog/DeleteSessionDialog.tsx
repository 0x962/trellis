import { useMutation } from "@tanstack/react-query";
import type { Session } from "@trellis/api";
import { ConfirmDialog, toast } from "@trellis/ui";
import { useApp } from "../../../lib/appContext";

export type DeleteSessionDialogProps = {
	session: Pick<Session, "id" | "name">;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	// Runs right after the server confirms the delete, before the caches
	// refetch. The session page leaves through it, so no page asks the
	// server for the deleted session.
	onDeleted?: () => void;
};

// The delete of a session: its agent stops and its directory goes with
// every file in it. The sidebar row menu and the session page share it.
export function DeleteSessionDialog({ session, open, onOpenChange, onDeleted }: DeleteSessionDialogProps) {
	const { client, orpc, queryClient } = useApp();
	const remove = useMutation({
		mutationFn: () => client.sessions.delete({ id: session.id }),
		onSuccess: async () => {
			onOpenChange(false);
			onDeleted?.();
			await queryClient.invalidateQueries({ queryKey: orpc.sessions.key() });
			toast(`Deleted ${session.name}`);
		},
		onError: (error) => toast.error(`Could not delete ${session.name}`, { description: error.message }),
	});
	return (
		<ConfirmDialog
			open={open}
			title={`Delete ${session.name}?`}
			description="This stops the agent and removes the session directory with every file in it. You cannot undo a delete."
			confirmLabel="Delete session"
			danger
			processing={remove.isPending}
			onConfirm={() => {
				if (!remove.isPending) remove.mutate();
			}}
			onCancel={() => {
				if (!remove.isPending) onOpenChange(false);
			}}
		/>
	);
}
