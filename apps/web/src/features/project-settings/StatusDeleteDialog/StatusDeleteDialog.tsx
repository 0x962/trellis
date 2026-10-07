import { ORPCError } from "@orpc/client";
import type { Status } from "@trellis/api";
import { errors } from "@trellis/api";
import { ConfirmDialog, FormStatus, Select } from "@trellis/ui";
import { useMemo, useState } from "react";
import { useApp } from "../../../lib/appContext";
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
	const alternatives = useMemo(
		() => statuses.filter((entry) => entry.id !== status?.id).map((entry) => ({ value: entry.id, label: entry.name })),
		[status, statuses],
	);
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
				<Select
					label="Move tickets to"
					placeholder="Select a status"
					items={alternatives}
					value={moveTo}
					disabled={busy}
					onValueChange={setMoveTo}
				/>
			)}
		</ConfirmDialog>
	);
}
