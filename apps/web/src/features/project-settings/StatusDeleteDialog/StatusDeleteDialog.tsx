import { ORPCError } from "@orpc/client";
import type { Status } from "@trellis/api";
import { errors } from "@trellis/api";
import { ConfirmDialog, Select } from "@trellis/ui";
import { useMemo, useState } from "react";
import { useApp } from "../../../lib/appContext";

export type StatusDeleteDialogProps = {
	project: string;
	status: Status | null;
	statuses: readonly Status[];
	onDeleted: () => Promise<void>;
	onClose: () => void;
};

export function StatusDeleteDialog({ project, status, statuses, onDeleted, onClose }: StatusDeleteDialogProps) {
	const { client } = useApp();
	const [message, setMessage] = useState<string | null>(null);
	const [moveTo, setMoveTo] = useState<string | null>(null);
	const alternatives = useMemo(
		() => statuses.filter((entry) => entry.id !== status?.id).map((entry) => ({ value: entry.id, label: entry.name })),
		[status, statuses],
	);

	const close = () => {
		setMessage(null);
		setMoveTo(null);
		onClose();
	};

	const remove = async () => {
		try {
			await client.statuses.delete({
				project,
				status: status!.id,
				...(moveTo === null ? {} : { moveTo }),
			});
			await onDeleted();
			close();
		} catch (error) {
			if (error instanceof ORPCError && error.code === "STATUS_IN_USE") {
				const count = (error.data as { count: number }).count;
				setMessage(
					`${count} ${count === 1 ? "ticket uses" : "tickets use"} this status. Select a status to move them to.`,
				);
				setMoveTo(alternatives[0]!.value);
				return;
			}
			if (error instanceof ORPCError && error.code === "LAST_STATUS") {
				setMessage(errors.LAST_STATUS.message);
				return;
			}
			setMessage((error as Error).message);
		}
	};

	return (
		<ConfirmDialog
			open={status !== null}
			title={`Delete ${status?.name ?? "status"}?`}
			description="trellis deletes the status from the project."
			confirmLabel="Delete status"
			danger
			onConfirm={() => void remove()}
			onCancel={close}
		>
			{message !== null && (
				<p role="alert" className="text-sm text-danger">
					{message}
				</p>
			)}
			{moveTo !== null && (
				<Select label="Move tickets to" items={alternatives} value={moveTo} onValueChange={setMoveTo} />
			)}
		</ConfirmDialog>
	);
}
