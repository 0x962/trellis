import type { Priority, Ticket, TicketSummary } from "@trellis/api";
import { Button, ConfirmDialog, Dialog, Kbd, SectionHeader, Switch, useHotkey } from "@trellis/ui";
import { useId, useRef, useState } from "react";
import { failToast } from "../../../lib/failToast";
import { AttachmentBox } from "../../attachments/AttachmentBox";
import { DropTarget } from "../../attachments/DropTarget";
import { useUploads } from "../../attachments/hooks/useUploads";
import { UploadProgress } from "../../attachments/UploadProgress";
import { composerActions, useComposerStore } from "../composerStore";
import { defaultStatus, useComposerDefaults } from "../hooks/useComposerDefaults";
import { useComposerDraft } from "../hooks/useComposerDraft";
import { useCreateTicket } from "../hooks/useCreateTicket";
import { useLabelDraft } from "../hooks/useLabelDraft";
import { ChipRow } from "./components/ChipRow";
import { ComposerHeader } from "./components/ComposerHeader";
import { DescriptionField } from "./components/DescriptionField";
import { composerCloseAction } from "./composerCloseAction";

// The quick composer keeps its text and selected files until a create or a
// confirmed discard. It uploads files only after the server creates the ticket.
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
	// An epic ref and a milestone ref. `undefined` keeps the default of the
	// page that opened the composer, and `null` is the choice of none.
	const [epic, setEpic] = useState<string | null | undefined>();
	const [milestone, setMilestone] = useState<string | null | undefined>();
	const [editing, setEditing] = useState(draft.description !== "");
	const [titleMissing, setTitleMissing] = useState(false);
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
	const titleId = useId();
	const titleErrorId = useId();

	const chosenProject = project ?? defaults.project;
	const labelDraft = useLabelDraft(chosenProject);
	const bySlug = (slug: string | undefined) => defaults.statuses.find((entry) => entry.slug === slug);
	const chosenStatus = bySlug(status ?? defaults.status) ?? defaultStatus(defaults.statuses);
	const chosenPriority = priority ?? defaults.priority;
	const chosenEpic = (epic === undefined ? defaults.epic : epic) ?? undefined;
	const chosenMilestone = (milestone === undefined ? defaults.milestone : milestone) ?? undefined;
	const description = draft.description === "" ? defaults.template : draft.description;
	const dirty =
		draft.title.trim() !== "" ||
		(draft.description !== "" && draft.description !== defaults.template) ||
		uploads.uploads.length > 0;
	const needsUpload = uploads.uploads.some((upload) => upload.status !== "complete");

	const finish = (stay: boolean) => {
		clearDraft();
		labelDraft.clear();
		uploads.clear();
		setCreatedTicket(null);
		if (!stay) {
			composerActions.close();
			return;
		}
		setEditing(false);
		setEditorKey((key) => key + 1);
		titleRef.current?.focus();
	};

	// inFlight blocks a second hotkey event that arrives before `creating`
	// renders. A failed ticket create leaves each selected file on this form,
	// so the next attempt sends the same files and creates no second ticket.
	const create = async (stay: boolean) => {
		const title = draft.title.trim();
		if (title === "") {
			setTitleMissing(true);
			titleRef.current?.focus();
			return;
		}
		if (chosenProject === undefined) {
			setProjectMissing(true);
			return;
		}
		if (inFlight.current) return;
		setTitleMissing(false);
		setProjectMissing(false);
		const parentRef = parent === undefined ? defaults.parent : (parent?.identifier ?? undefined);
		inFlight.current = true;
		setCreating(true);
		try {
			let ticket = createdTicket;
			if (ticket === null) {
				try {
					ticket = await createTicket({
						project: chosenProject,
						title,
						status: chosenStatus?.slug,
						priority: chosenPriority,
						...(parentRef === undefined ? {} : { parent: parentRef }),
						...(chosenEpic === undefined ? {} : { epic: chosenEpic }),
						...(chosenMilestone === undefined ? {} : { milestone: chosenMilestone }),
						...(labelDraft.labels.length === 0 ? {} : { labels: labelDraft.labels.map((label) => label.id) }),
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
		const action = composerCloseAction({ createPending: inFlight.current, dirty });
		if (action === "block") return;
		if (action === "confirm") {
			setAsking(true);
			return;
		}
		clearDraft();
		composerActions.close();
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
				<div className="flex min-h-0 flex-col gap-2 p-3">
					<ComposerHeader closeDisabled={creating} onClose={requestClose} />
					<div className="flex flex-col rounded-lg border border-border bg-elevated">
						<fieldset disabled={createdTicket !== null} className="contents">
							<label htmlFor={titleId} className="sr-only">
								Title
							</label>
							<input
								id={titleId}
								ref={titleRef}
								aria-invalid={(titleMissing && draft.title.trim() === "") || undefined}
								aria-describedby={titleMissing && draft.title.trim() === "" ? titleErrorId : undefined}
								autoComplete="off"
								maxLength={500}
								placeholder="Ticket title"
								value={draft.title}
								onChange={(event) => setDraft({ ...draft, title: event.target.value })}
								className="h-10 w-full rounded-sm bg-transparent px-3 pt-1 text-xl font-semibold text-fg outline-none placeholder:text-fg-faint focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
							/>
							{titleMissing && draft.title.trim() === "" && (
								<p id={titleErrorId} role="alert" className="px-3 text-xs text-danger">
									Add a ticket title.
								</p>
							)}
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
								epic={chosenEpic}
								milestone={chosenMilestone}
								labels={labelDraft.labels}
								onProject={(next) => {
									setProject(next);
									setProjectMissing(false);
								}}
								onStatus={(next) => setStatus(next.slug)}
								onPriority={setPriority}
								onParent={setParent}
								onEpic={(next) => {
									setEpic(next);
									setMilestone(null);
								}}
								onMilestone={setMilestone}
								onLabel={labelDraft.toggle}
							/>
						</fieldset>
					</div>
					<div className="flex flex-col gap-2 px-1 pt-1">
						<SectionHeader
							title="Attachments"
							count={uploads.uploads.length > 0 ? uploads.uploads.length : undefined}
							actions={<AttachmentBox uploads={uploads} />}
						/>
						{uploads.uploads.map((upload) => (
							<UploadProgress key={upload.id} upload={upload} onDismiss={uploads.dismiss} />
						))}
					</div>
					<div className="flex flex-wrap items-center gap-2 px-1 pt-1">
						<Switch
							label="Keep open after create"
							checked={createMore}
							onCheckedChange={setCreateMore}
							className="text-xs text-fg-muted"
						/>
						<div className="ml-auto flex items-center gap-2">
							<span className="hidden items-center gap-1 text-xs text-fg-muted sm:inline-flex">
								<Kbd>⌘↩</Kbd> to create
							</span>
							<Button variant="primary" size="md" processing={creating} onClick={() => void create(createMore)}>
								{createdTicket === null ? "Create ticket" : needsUpload ? "Retry attachments" : "Finish"}
							</Button>
						</div>
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
				processing={creating}
				onConfirm={() => {
					if (composerCloseAction({ createPending: inFlight.current, dirty: false }) === "block") return;
					setAsking(false);
					clearDraft();
					uploads.clear();
					composerActions.close();
				}}
				onCancel={() => {
					if (!inFlight.current) setAsking(false);
				}}
			/>
		</Dialog>
	);
}
