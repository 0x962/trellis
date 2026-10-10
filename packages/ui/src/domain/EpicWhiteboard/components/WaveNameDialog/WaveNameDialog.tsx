import { useState } from "react";
import { Button } from "../../../../primitives/Button";
import { Dialog } from "../../../../primitives/Dialog";
import { Input } from "../../../../primitives/Input";
import type { EpicWhiteboardProps } from "../../types";

export function WaveNameDialog(props: NonNullable<EpicWhiteboardProps["waveDraft"]>) {
	const [name, setName] = useState(props.name);
	return (
		<Dialog
			open
			title="Create wave from selection"
			description={`${props.ticketCount} selected ${props.ticketCount === 1 ? "ticket moves" : "tickets move"} to this wave.`}
			onOpenChange={(open) => !open && !props.busy && props.onClose()}
		>
			<form
				className="flex flex-col gap-4"
				onSubmit={(event) => {
					event.preventDefault();
					props.onCreate(name.trim());
				}}
			>
				<Input
					label="Wave name"
					value={name}
					onChange={(event) => setName(event.target.value)}
					required
					error={props.error}
					disabled={props.busy}
				/>
				<div className="flex justify-end gap-2">
					<Button onClick={props.onClose} disabled={props.busy}>
						Cancel
					</Button>
					<Button type="submit" variant="primary" processing={props.busy} disabled={!name.trim()}>
						Create wave
					</Button>
				</div>
			</form>
		</Dialog>
	);
}
