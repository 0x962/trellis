import { ORPCError } from "@orpc/client";
import type { Status } from "@trellis/api";
import { errors } from "@trellis/api";
import { ConfirmDialog, FormStatus, PickerButton } from "@trellis/ui";
import { useMemo, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { StatusPicker } from "../../pickers/StatusPicker";
import { statusDeletePresentation } from "./statusDeletePresentation";

export type StatusDeleteDialogProps = {
	project: string;
	status: Status | null;
	statuses: readonly Status[];
	ticketCount: number;
	busy: boolean;
	onWrite: (operation: () => Promise<void>) => Promise<void>;
	onDeleted: () => Promise<void>;
	onClose: () => void;
};

export function StatusDeleteDialog({
	project,
	status,
	statuses,
	ticketCount,
	busy,
	onWrite,
	onDeleted,
	onClose,
}: StatusDeleteDialogProps) {
	const { client } = useApp();
	const [message, setMessage] = useState<string | null>(null);
	const [moveTo, setMoveTo] = useState("");
	const [ticketCountOverride, setTicketCountOverride] = useState<number | null>(null);
	const [lastStatusOverride, setLastStatusOverride] = useState(false);
	const alternatives = useMemo(() => statuses.filter((entry) => entry.id !== status?.id), [status, statuses]);
	const effectiveTicketCount = ticketCountOverride ?? ticketCount;
	const lastStatus = lastStatusOverride || statuses.length === 1;
	const presentation = statusDeletePresentation(effectiveTicketCount, lastStatus, moveTo);

	const close = () => {
		setMessage(null);
		setMoveTo("");
		setTicketCountOverride(null);
		setLastStatusOverride(false);
		onClose();
	};

	const remove = async () => {
		try {
			await onWrite(async () => {
				await client.statuses.delete({
					project,
					status: status!.id,
					...(moveTo === "" ? {} : { moveTo }),
				});
				await onDeleted();
				close();
			});
		} catch (error) {
			if (error instanceof ORPCError && error.code === "STATUS_IN_USE") {
				const count = (error.data as { count: number }).count;
				setTicketCountOverride(count);
				setMoveTo("");
				setMessage("Ticket use changed. Select a status to move the tickets to.");
				return;
			}
			if (error instanceof ORPCError && error.code === "LAST_STATUS") {
				setLastStatusOverride(true);
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
			description={presentation.description}
			confirmLabel="Delete status"
			confirmDisabled={presentation.confirmDisabled}
			processing={busy}
			danger
			onConfirm={() => void remove()}
			onCancel={close}
		>
			{message !== null && <FormStatus status="error" message={message} />}
			{presentation.needsReplacement && !lastStatus && (
				<StatusPicker
					project={project}
					statuses={alternatives}
					value={moveTo}
					onPick={(picked) => setMoveTo(picked.id)}
					trigger={
						<PickerButton label="Move tickets to" disabled={busy}>
							{alternatives.find((entry) => entry.id === moveTo)?.name ?? "Select a status"}
						</PickerButton>
					}
				/>
			)}
		</ConfirmDialog>
	);
}
