import type { Priority, Ticket, TicketSummary } from "@trellis/api";
import { Button, ConfirmDialog, Dialog, SectionHeader, Switch, useHotkey } from "@trellis/ui";
import { useRef, useState } from "react";
import { failToast } from "../../../lib/failToast";
import { AttachmentBox } from "../../attachments/AttachmentBox";
import { DropTarget } from "../../attachments/DropTarget";
import { useUploads } from "../../attachments/hooks/useUploads";
import { UploadProgress } from "../../attachments/UploadProgress";
import { composerActions, useComposerStore } from "../composerStore";
import { defaultStatus, useComposerDefaults } from "../hooks/useComposerDefaults";
import { useComposerDraft } from "../hooks/useComposerDraft";
import { useCreateTicket } from "../hooks/useCreateTicket";
import { ChipRow } from "./components/ChipRow";
import { ComposerHeader } from "./components/ComposerHeader";
import { DescriptionField } from "./components/DescriptionField";

// The quick composer keeps its text and selected files until create or
// discard. It uploads the files only after the server creates the ticket.
export function CreateTicketDialog() {
	const options = useComposerStore((state) => state.options);
	const { draft, setDraft, clearDraft } = useComposerDraft();
	const createTicket = useCreateTicket();
	const [project, setProject] = useState<string | undefined>();
	const defaults = useComposerDefaults(options, project);
	// A status slug. A project change keeps it, so the ticket stays in a
	// status of that name when the new project has one.
	const [status, setStatus] = useState<string | undefined>();
	const [priority, setPriority] = useState<Priority | undefined>();
	const [parent, setParent] = useState<TicketSummary | null | undefined>();
	const [editing, setEditing] = useState(draft.description !== "");
	const [projectMissing, setProjectMissing] = useState(false);
	const [asking, setAsking] = useState(false);
	const [editorKey, setEditorKey] = useState(0);
	const [creating, setCreating] = useState(false);
	const [createMore, setCreateMore] = useState(false);
	// The ticket the server already created. While it is set, the form
	// fields stay disabled and only the attachments still need a request.
	const [createdTicket, setCreatedTicket] = useState<Ticket | null>(null);
	const uploads = useUploads(undefined, false);
	const inFlight = useRef(false);
	const titleRef = useRef<HTMLInputElement>(null);

	const chosenProject = project ?? defaults.project;
	const bySlug = (slug: string | undefined) => defaults.statuses.find((entry) => entry.slug === slug);
	const chosenStatus = bySlug(status ?? defaults.status) ?? defaultStatus(defaults.statuses);
	const chosenPriority = priority ?? defaults.priority;
	const description = draft.description === "" ? defaults.template : draft.description;
	const dirty =
		draft.title.trim() !== "" ||
		(draft.description !== "" && draft.description !== defaults.template) ||
		uploads.uploads.length > 0;
	const needsUpload = uploads.uploads.some((upload) => upload.status !== "complete");

	const finish = (stay: boolean) => {
		clearDraft();
		uploads.clear();
		setCreatedTicket(null);
		if (!stay) {
			composerActions.close();
			return;
		}
		setEditing(false);
		setEditorKey((key) => key + 1);
	};

	// inFlight blocks a second hotkey event that arrives before `creating`
	// renders. A failed ticket create leaves each selected file on this form,
	// so the next attempt sends the same files and creates no second ticket.
	const create = async (stay: boolean) => {
		const title = draft.title.trim();
		if ((createdTicket === null && title === "") || inFlight.current) return;
		const parentRef = parent === undefined ? defaults.parent : (parent?.identifier ?? undefined);
		inFlight.current = true;
		setCreating(true);
		try {
			let ticket = createdTicket;
			if (ticket === null) {
				if (chosenProject === undefined) {
					setProjectMissing(true);
					return;
				}
				try {
					ticket = await createTicket({
						project: chosenProject,
						title,
						status: chosenStatus?.slug,
						priority: chosenPriority,
						...(parentRef === undefined ? {} : { parent: parentRef }),
						...(editing ? { description } : {}),
					});
				} catch (error) {
					failToast("The ticket did not save.", error, () => void create(stay));
					return;
				}
				setCreatedTicket(ticket);
			}
			if (await uploads.uploadPending(ticket.identifier)) finish(stay);
		} finally {
			inFlight.current = false;
			setCreating(false);
		}
	};

	const requestClose = () => {
		if (dirty) setAsking(true);
		else {
			clearDraft();
			composerActions.close();
		}
	};

	useHotkey("mod+enter", () => void create(createMore));
	useHotkey("mod+shift+enter", () => void create(true));

	return (
		<Dialog
			open
			onOpenChange={(next) => !next && requestClose()}
			title="New ticket"
			size="lg"
			bare
			initialFocus={titleRef}
			className="gap-0 bg-surface p-0"
		>
			<DropTarget identifier={createdTicket?.identifier ?? "new ticket"} onFiles={uploads.addFiles}>
				<div className="flex min-h-0 flex-col">
					<div className="border-b border-border p-4">
						<ComposerHeader project={chosenProject} onClose={requestClose} />
					</div>
					<div className="flex flex-1 flex-col gap-4 p-6 max-md:p-4">
						<fieldset disabled={createdTicket !== null} className="contents">
							<input
								ref={titleRef}
								aria-label="Title"
								autoComplete="off"
								maxLength={500}
								placeholder="Ticket title"
								value={draft.title}
								onChange={(event) => setDraft({ ...draft, title: event.target.value })}
								className="h-7 w-full bg-transparent text-xl font-semibold text-fg outline-none placeholder:text-fg-faint"
							/>
							<DescriptionField
								key={editorKey}
								markdown={description}
								editing={editing}
								onEdit={() => setEditing(true)}
								onChange={(markdown) => setDraft({ ...draft, description: markdown })}
							/>
							<ChipRow
								project={chosenProject}
								projectMissing={projectMissing && chosenProject === undefined}
								statuses={defaults.statuses}
								status={chosenStatus}
								priority={chosenPriority}
								parent={parent ?? null}
								parentRef={parent === undefined ? defaults.parent : undefined}
								onProject={setProject}
								onStatus={(next) => setStatus(next.slug)}
								onPriority={setPriority}
								onParent={setParent}
							/>
						</fieldset>
						<div className="flex flex-col gap-2">
							<SectionHeader
								title="Attachments"
								count={uploads.uploads.length > 0 ? uploads.uploads.length : undefined}
								actions={<AttachmentBox uploads={uploads} />}
							/>
							{uploads.uploads.map((upload) => (
								<UploadProgress key={upload.id} upload={upload} onDismiss={uploads.dismiss} />
							))}
						</div>
					</div>
					<div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-border bg-surface p-4">
						<Switch
							label="Create more"
							checked={createMore}
							onCheckedChange={setCreateMore}
							className="text-xs text-fg-muted"
						/>
						<Button variant="primary" size="md" disabled={creating} onClick={() => void create(createMore)} kbd="⌘↩">
							{createdTicket === null ? "Create" : needsUpload ? "Retry attachments" : "Finish"}
						</Button>
					</div>
				</div>
			</DropTarget>
			<ConfirmDialog
				open={asking}
				modal={false}
				title={createdTicket === null ? "Discard the draft?" : "Discard selected attachments?"}
				description={
					createdTicket === null
						? "Trellis deletes the title, the description, and the selected attachments."
						: `Trellis keeps ${createdTicket.identifier} and removes files that are not attached.`
				}
				confirmLabel="Discard"
				danger
				onConfirm={() => {
					setAsking(false);
					clearDraft();
					uploads.clear();
					composerActions.close();
				}}
				onCancel={() => setAsking(false)}
			/>
		</Dialog>
	);
}
