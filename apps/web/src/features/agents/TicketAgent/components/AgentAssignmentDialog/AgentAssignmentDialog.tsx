import { Plus } from "@phosphor-icons/react";
import { HarnessSchema } from "@trellis/api";
import { Dialog, IconButton, Tooltip } from "@trellis/ui";
import { useState } from "react";
import { AssignmentForm } from "./components/AssignmentForm";

export function AgentAssignmentDialog({ ticket, disabled }: { ticket: string; disabled: boolean }) {
	const [open, setOpen] = useState(false);
	return (
		<>
			<Tooltip content="Assign agent">
				<IconButton label="Assign agent" icon={<Plus />} disabled={disabled} onClick={() => setOpen(true)} />
			</Tooltip>
			<Dialog
				open={open}
				onOpenChange={setOpen}
				title="Assign an agent"
				description="Select the harness, model, and effort for this ticket."
			>
				<AssignmentForm
					ticket={ticket}
					initialHarness={HarnessSchema.parse({ preset: "claude" })}
					onClose={() => setOpen(false)}
				/>
			</Dialog>
		</>
	);
}
