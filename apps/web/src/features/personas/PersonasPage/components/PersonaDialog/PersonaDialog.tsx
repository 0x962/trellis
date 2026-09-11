import { useMutation } from "@tanstack/react-query";
import { type Persona, PersonaCreateInputSchema } from "@trellis/api";
import { Button, Dialog, Input, Textarea } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";

type PersonaDialogProps = { persona?: Persona; onClose: () => void };

export function PersonaDialog({ persona, onClose }: PersonaDialogProps) {
	const { client, orpc, queryClient } = useApp();
	const [name, setName] = useState(persona?.name ?? "");
	const [instruction, setInstruction] = useState(persona?.instruction ?? "");
	const input = PersonaCreateInputSchema.safeParse({ name, instruction });
	const save = useMutation({
		mutationFn: (fields: { name: string; instruction: string }) =>
			persona === undefined ? client.personas.create(fields) : client.personas.update({ id: persona.id, ...fields }),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: orpc.personas.list.key() });
			onClose();
		},
	});

	return (
		<Dialog
			open
			title={persona === undefined ? "New persona" : "Edit persona"}
			size="lg"
			className="max-h-full overflow-y-auto"
			onOpenChange={(open) => !open && !save.isPending && onClose()}
		>
			<form
				className="flex min-h-0 flex-col gap-4"
				onSubmit={(event) => {
					event.preventDefault();
					if (input.success && !save.isPending) save.mutate(input.data);
				}}
			>
				<Input
					label="Name"
					required
					autoFocus
					autoComplete="off"
					maxLength={120}
					disabled={save.isPending}
					value={name}
					onChange={(event) => setName(event.target.value)}
					className="pointer-coarse:h-11"
				/>
				<Textarea
					label="Instruction"
					required
					rows={8}
					maxLength={200000}
					disabled={save.isPending}
					value={instruction}
					onChange={(event) => setInstruction(event.target.value)}
					placeholder="Describe the persona's role and how it should work."
				/>
				{save.isError && (
					<p role="alert" className="text-sm text-danger">
						Could not save the persona. {save.error.message}
					</p>
				)}
				<div className="flex items-center justify-end gap-2">
					<Button type="button" variant="quiet" disabled={save.isPending} onClick={onClose}>
						Cancel
					</Button>
					<Button
						type="submit"
						variant="primary"
						disabled={!input.success || save.isPending}
						aria-busy={save.isPending}
					>
						{persona === undefined ? "Create persona" : "Save changes"}
					</Button>
				</div>
			</form>
		</Dialog>
	);
}
