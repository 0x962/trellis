import { useMutation } from "@tanstack/react-query";
import { type Flow, type FlowCreateInput, FlowCreateInputSchema } from "@trellis/api";
import { Button, Dialog, Input } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";

type NewFlowDialogProps = { onClose: () => void; onCreated: (flow: Flow) => void };

// The server takes a slug from the name, so the dialog asks for the name only.
export function NewFlowDialog({ onClose, onCreated }: NewFlowDialogProps) {
	const { client, orpc, queryClient } = useApp();
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const input = FlowCreateInputSchema.safeParse({ name, description });
	const create = useMutation({
		mutationFn: (fields: FlowCreateInput) => client.flows.create(fields),
		onSuccess: async (flow) => {
			await queryClient.invalidateQueries({ queryKey: orpc.flows.list.key() });
			onCreated(flow);
		},
	});

	return (
		<Dialog open title="New flow" onOpenChange={(open) => !open && !create.isPending && onClose()}>
			<form
				className="flex flex-col gap-4"
				onSubmit={(event) => {
					event.preventDefault();
					if (input.success && !create.isPending) create.mutate(input.data);
				}}
			>
				<Input
					label="Name"
					required
					autoComplete="off"
					maxLength={120}
					disabled={create.isPending}
					value={name}
					onChange={(event) => setName(event.target.value)}
				/>
				<Input
					label="Description"
					autoComplete="off"
					maxLength={2000}
					disabled={create.isPending}
					value={description}
					onChange={(event) => setDescription(event.target.value)}
				/>
				{create.isError && (
					<p role="alert" className="text-sm text-danger">
						Could not create the flow. {create.error.message}
					</p>
				)}
				<div className="flex justify-end gap-2">
					<Button type="button" variant="quiet" disabled={create.isPending} onClick={onClose}>
						Cancel
					</Button>
					<Button
						type="submit"
						variant="primary"
						disabled={!input.success || create.isPending}
						aria-busy={create.isPending}
					>
						Create flow
					</Button>
				</div>
			</form>
		</Dialog>
	);
}
