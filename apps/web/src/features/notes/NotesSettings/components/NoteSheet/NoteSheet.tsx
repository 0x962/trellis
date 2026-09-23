import { useMutation } from "@tanstack/react-query";
import {
	NOTE_BODY_MAX,
	NOTE_TITLE_MAX,
	type Note,
	type NoteAudience,
	type NoteCreateInput,
	NoteCreateInputSchema,
	type Project,
} from "@trellis/api";
import { Button, Input, Select, Sheet, SheetBody, SheetFooter, Textarea } from "@trellis/ui";
import { useRef, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { noteAudiences } from "./audiences";

type NoteSheetProps = { project: Project; note?: Note; readOnly?: boolean; onClose: () => void };

// The `datetime-local` control reads and writes `YYYY-MM-DDTHH:mm` in the
// local zone. The API carries an ISO instant, so the two forms convert here.
const toLocalInput = (iso: string | null) => {
	if (iso === null) return "";
	const date = new Date(iso);
	const pad = (value: number) => String(value).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const toIso = (local: string) => (local === "" ? null : new Date(local).toISOString());

export function NoteSheet({ project, note, readOnly = false, onClose }: NoteSheetProps) {
	const { client, orpc, queryClient } = useApp();
	const titleRef = useRef<HTMLInputElement>(null);
	const [title, setTitle] = useState(note?.title ?? "");
	const [audience, setAudience] = useState<NoteAudience>(note?.audience ?? "all");
	const [body, setBody] = useState(note?.body ?? "");
	const [expires, setExpires] = useState(toLocalInput(note?.expiresAt ?? null));
	const [confirmDelete, setConfirmDelete] = useState(false);
	const input = NoteCreateInputSchema.safeParse({
		project: project.key,
		title,
		body,
		audience,
		expiresAt: toIso(expires),
	});
	const saved = async () => {
		await queryClient.invalidateQueries({ queryKey: orpc.notes.key() });
		onClose();
	};
	const save = useMutation({
		mutationFn: (fields: NoteCreateInput) =>
			note === undefined
				? client.notes.create(fields)
				: client.notes.update({
						id: note.id,
						title: fields.title,
						body: fields.body,
						audience: fields.audience,
						expiresAt: fields.expiresAt ?? null,
					}),
		onSuccess: saved,
	});
	const remove = useMutation({ mutationFn: () => client.notes.delete({ id: note!.id }), onSuccess: saved });
	const pending = save.isPending || remove.isPending;
	const dirty =
		note !== undefined &&
		(title !== note.title || audience !== note.audience || body !== note.body || toIso(expires) !== note.expiresAt);

	return (
		<Sheet
			open
			title={note === undefined ? "New note" : readOnly ? "Note" : "Edit note"}
			initialFocus={titleRef}
			titleClassName="text-md font-medium"
			onOpenChange={(open) => !open && !pending && onClose()}
		>
			<form
				className="flex min-h-full flex-col"
				onSubmit={(event) => {
					event.preventDefault();
					if (input.success && !pending && !readOnly) save.mutate(input.data);
				}}
			>
				<SheetBody>
					<p className="text-sm text-fg-muted">Every agent of {project.key} reads this note when it starts.</p>
					<Input
						ref={titleRef}
						label="Title"
						required
						autoComplete="off"
						maxLength={NOTE_TITLE_MAX}
						disabled={readOnly || pending}
						value={title}
						onChange={(event) => setTitle(event.target.value)}
						className="pointer-coarse:h-11"
					/>
					<div className="flex flex-col items-start gap-2">
						<span className="text-sm text-fg-muted">Audience</span>
						<Select
							label="Audience"
							items={noteAudiences}
							value={audience}
							onValueChange={setAudience}
							disabled={readOnly || pending}
							className="w-full pointer-coarse:h-11"
						/>
						<p className="text-xs text-fg-faint">
							{noteAudiences.find((item) => item.value === audience)!.description}
						</p>
					</div>
					<Textarea
						label="Body"
						required
						rows={12}
						maxLength={NOTE_BODY_MAX}
						disabled={readOnly || pending}
						value={body}
						onChange={(event) => setBody(event.target.value)}
						placeholder="State the fact, the current state, or the decision that later agents must know."
					/>
					<Input
						label="Expires"
						type="datetime-local"
						disabled={readOnly || pending}
						value={expires}
						onChange={(event) => setExpires(event.target.value)}
						className="pointer-coarse:h-11"
					/>
					<p className="text-xs text-fg-faint">
						An expired note stays here and leaves every agent prompt. Leave it empty for a durable note.
					</p>
					{save.isError && (
						<p role="alert" className="text-sm text-danger">
							Could not save the note. {save.error.message}
						</p>
					)}
					{remove.isError && (
						<p role="alert" className="text-sm text-danger">
							Could not delete the note. {remove.error.message}
						</p>
					)}
				</SheetBody>
				<SheetFooter
					confirmation={
						!readOnly &&
						confirmDelete && (
							<fieldset
								className="flex flex-wrap items-center gap-2 border border-danger p-3"
								aria-label="Confirm deletion"
							>
								<p className="w-full break-words text-sm text-fg">Delete “{note!.title}”?</p>
								<p className="w-full text-sm text-fg-muted">Agents that start later do not read this note.</p>
								<Button type="button" variant="danger" disabled={pending} onClick={() => remove.mutate()}>
									Confirm delete
								</Button>
								<Button type="button" variant="quiet" disabled={pending} onClick={() => setConfirmDelete(false)}>
									Keep note
								</Button>
							</fieldset>
						)
					}
					leading={
						!readOnly &&
						note !== undefined && (
							<Button
								type="button"
								variant="quiet"
								disabled={pending || confirmDelete}
								onClick={() => setConfirmDelete(true)}
							>
								Delete note
							</Button>
						)
					}
				>
					{readOnly ? (
						<Button type="button" variant="primary" onClick={onClose}>
							Close
						</Button>
					) : (
						<>
							<Button type="button" variant="quiet" disabled={pending} onClick={onClose}>
								Cancel
							</Button>
							<Button
								type="submit"
								variant="primary"
								disabled={!input.success || pending || confirmDelete || (note !== undefined && !dirty)}
								aria-busy={save.isPending}
							>
								{note === undefined ? "Create note" : "Save changes"}
							</Button>
						</>
					)}
				</SheetFooter>
			</form>
		</Sheet>
	);
}
