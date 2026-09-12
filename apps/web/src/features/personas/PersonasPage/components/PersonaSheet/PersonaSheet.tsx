import { useMutation } from "@tanstack/react-query";
import { type Persona, type PersonaCreateInput, PersonaCreateInputSchema, type PersonaKind } from "@trellis/api";
import { Button, Input, Select, Sheet, SheetBody, SheetFooter, Textarea } from "@trellis/ui";
import { useRef, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { personaKinds } from "../../kinds";

type PersonaSheetProps = { persona?: Persona; kind: PersonaKind; onClose: () => void };

export function PersonaSheet({ persona, kind: initialKind, onClose }: PersonaSheetProps) {
	const { client, orpc, queryClient } = useApp();
	const nameRef = useRef<HTMLInputElement>(null);
	const [name, setName] = useState(persona?.name ?? "");
	const [kind, setKind] = useState(persona?.kind ?? initialKind);
	const [instruction, setInstruction] = useState(persona?.instruction ?? "");
	const [confirmDelete, setConfirmDelete] = useState(false);
	const input = PersonaCreateInputSchema.safeParse({ name, kind, instruction });
	const saved = async () => {
		await queryClient.invalidateQueries({ queryKey: orpc.personas.list.key() });
		onClose();
	};
	const save = useMutation({
		mutationFn: (fields: PersonaCreateInput) =>
			persona === undefined ? client.personas.create(fields) : client.personas.update({ id: persona.id, ...fields }),
		onSuccess: saved,
	});
	const remove = useMutation({ mutationFn: () => client.personas.delete({ id: persona!.id }), onSuccess: saved });
	const pending = save.isPending || remove.isPending;
	const dirty =
		persona !== undefined && (name !== persona.name || kind !== persona.kind || instruction !== persona.instruction);

	return (
		<Sheet
			open
			title={persona === undefined ? "New persona" : "Edit persona"}
			initialFocus={nameRef}
			titleClassName="text-md font-medium"
			onOpenChange={(open) => !open && !pending && onClose()}
		>
			<form
				className="flex min-h-full flex-col"
				onSubmit={(event) => {
					event.preventDefault();
					if (input.success && !pending) save.mutate(input.data);
				}}
			>
				<SheetBody>
					<p className="text-sm text-fg-muted">Define the role and instructions an agent uses when it starts.</p>
					<Input
						ref={nameRef}
						label="Name"
						required
						autoComplete="off"
						maxLength={120}
						disabled={pending}
						value={name}
						onChange={(event) => setName(event.target.value)}
						className="pointer-coarse:h-11"
					/>
					<div className="flex flex-col items-start gap-2">
						<span className="text-sm text-fg-muted">Kind</span>
						<Select
							label="Kind"
							items={personaKinds}
							value={kind}
							onValueChange={setKind}
							disabled={pending}
							className="w-full pointer-coarse:h-11"
						/>
						<p className="text-xs text-fg-faint">{personaKinds.find((item) => item.value === kind)!.description}</p>
					</div>
					<Textarea
						label="Instruction"
						required
						rows={16}
						maxLength={200000}
						disabled={pending}
						value={instruction}
						onChange={(event) => setInstruction(event.target.value)}
						placeholder="Describe the role, workflow, and expected result."
					/>
					{save.isError && (
						<p role="alert" className="text-sm text-danger">
							Could not save the persona. {save.error.message}
						</p>
					)}
					{remove.isError && (
						<p role="alert" className="text-sm text-danger">
							Could not delete the persona. {remove.error.message}
						</p>
					)}
				</SheetBody>
				<SheetFooter
					confirmation={
						confirmDelete && (
							<fieldset
								className="flex flex-wrap items-center gap-2 border border-danger p-3"
								aria-label="Confirm deletion"
							>
								<p className="w-full break-words text-sm text-fg">Delete “{persona!.name}”?</p>
								<p className="w-full text-sm text-fg-muted">
									This permanently deletes the persona and its instructions.
								</p>
								<Button type="button" variant="danger" disabled={pending} onClick={() => remove.mutate()}>
									Confirm delete
								</Button>
								<Button type="button" variant="quiet" disabled={pending} onClick={() => setConfirmDelete(false)}>
									Keep persona
								</Button>
							</fieldset>
						)
					}
					leading={
						persona !== undefined && (
							<Button
								type="button"
								variant="quiet"
								disabled={pending || confirmDelete}
								onClick={() => setConfirmDelete(true)}
							>
								Delete persona
							</Button>
						)
					}
				>
					<Button type="button" variant="quiet" disabled={pending} onClick={onClose}>
						Cancel
					</Button>
					<Button
						type="submit"
						variant="primary"
						disabled={!input.success || pending || confirmDelete || (persona !== undefined && !dirty)}
						aria-busy={save.isPending}
					>
						{persona === undefined ? "Create persona" : "Save changes"}
					</Button>
				</SheetFooter>
			</form>
		</Sheet>
	);
}
