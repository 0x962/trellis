import { useState } from "react";
import { Button } from "../../primitives/Button";
import { Dialog } from "../../primitives/Dialog";
import { Input } from "../../primitives/Input";

export function RecoveryDecisionDialog({
	kind,
	details,
	processing,
	error,
	onConfirm,
	onCancel,
}: {
	kind: "delivery" | "assignment";
	details: string;
	processing: boolean;
	error?: string;
	onConfirm: (reason: string) => void;
	onCancel: () => void;
}) {
	const [reason, setReason] = useState("");
	const [confirmed, setConfirmed] = useState(false);
	const delivery = kind === "delivery";
	const label = delivery ? "Cancel delivery" : "Retire assignment";
	return (
		<Dialog
			open
			onOpenChange={(open) => !open && !processing && onCancel()}
			title={`${label}?`}
			description={
				delivery
					? "The receipt remains unknown. Trellis keeps the delivery history and does not resend this message. Cancellation does not stop an external process."
					: "Stop the old process in its external environment first. Trellis preserves its workspace, terminal, conversation, and history. This action only releases the recorded assignment."
			}
		>
			<p className="select-text whitespace-pre-wrap break-all font-mono text-xs">{details}</p>
			{delivery ? (
				<Input label="Reason" value={reason} onValueChange={setReason} maxLength={2000} disabled={processing} />
			) : (
				<label className="flex items-start gap-2 text-sm">
					<input
						type="checkbox"
						checked={confirmed}
						disabled={processing}
						onChange={(event) => setConfirmed(event.target.checked)}
					/>
					I confirm that this external process has stopped
				</label>
			)}
			{error && (
				<p role="alert" className="text-sm text-danger">
					{error}
				</p>
			)}
			<div className="flex justify-end gap-2">
				<Button disabled={processing} onClick={onCancel}>
					Back
				</Button>
				<Button
					variant="danger"
					processing={processing}
					disabled={delivery ? !reason.trim() : !confirmed}
					onClick={() => onConfirm(reason.trim())}
				>
					{label}
				</Button>
			</div>
		</Dialog>
	);
}
