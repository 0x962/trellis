import { useRouter } from "@tanstack/react-router";
import type { Priority, Ticket, TicketSummary } from "@trellis/api";
import { Button, Dialog, SectionHeader, Switch, toast, useHotkey } from "@trellis/ui";
import { useRef, useState } from "react";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { useApp } from "../../../lib/appContext";
import { AttachmentBox } from "../../attachments/AttachmentBox";
import { DropTarget } from "../../attachments/DropTarget";
import { useUploads } from "../../attachments/hooks/useUploads";
import { UploadProgress } from "../../attachments/UploadProgress";
import { insertRow } from "../../table/utils/cacheRows";
import { failToast } from "../../ticket/utils/failToast";
import { composerActions, useComposerStore } from "../composerStore";
import { defaultStatus, useComposerDefaults } from "../hooks/useComposerDefaults";
import { useComposerDraft } from "../hooks/useComposerDraft";
import { ChipRow } from "./components/ChipRow";
import { ComposerHeader } from "./components/ComposerHeader";
import { DescriptionField } from "./components/DescriptionField";

const summaryOf = (ticket: Ticket): TicketSummary => {
	const { description, children, prs, attachments, ...summary } = ticket;
	return summary;
};

// The quick composer keeps its text and selected files until create or
// discard. It uploads the files only after the server creates the ticket.
export function CreateTicketDialog() {
	const options = useComposerStore((state) => state.options);
	const { client, queryClient, orpc } = useApp();
	const router = useRouter();
	const { draft, setDraft, clearDraft } = useComposerDraft();
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
	const [created, setCreated] = useState<Ticket | null>(null);
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

	const openTicket = (identifier: string) => void router.navigate({ href: `/t/${identifier}` });

	const finish = (stay: boolean) => {
		clearDraft();
		uploads.clear();
		setCreated(null);
		if (!stay) {
			composerActions.close();
			return;
		}
		setEditing(false);
		setEditorKey((key) => key + 1);
	};

	// The ref blocks two hotkey events that arrive before `creating` renders.
	// A failed ticket create leaves each selected file pending on this form.
	const create = async (stay: boolean) => {
		const title = draft.title.trim();
		if ((created === null && title === "") || inFlight.current) return;
		const parentRef = parent === undefined ? defaults.parent : (parent?.identifier ?? undefined);
		inFlight.current = true;
		setCreating(true);
		try {
			let ticket = created;
			if (ticket === null) {
				if (chosenProject === undefined) {
					setProjectMissing(true);
					return;
				}
				try {
					ticket = await client.tickets.create({
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
				insertRow(queryClient, summaryOf(ticket));
				void queryClient.invalidateQueries({ queryKey: orpc.tickets.counts.key() });
				void queryClient.invalidateQueries({ queryKey: orpc.projects.key() });
				const identifier = ticket.identifier;
				toast.success(`Created ${identifier}`, {
					action: { label: "Open", onClick: () => openTicket(identifier) },
				});
				setCreated(ticket);
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
			<DropTarget identifier={created?.identifier ?? "new ticket"} onFiles={uploads.start}>
				<div className="flex min-h-0 flex-col">
					<div className="border-b border-border p-4">
						<ComposerHeader project={chosenProject} onClose={requestClose} />
					</div>
					<div className="flex flex-1 flex-col gap-4 p-6 max-md:p-4">
						<fieldset disabled={created !== null} className="contents">
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
							{created === null ? "Create" : needsUpload ? "Retry attachments" : "Finish"}
						</Button>
					</div>
				</div>
			</DropTarget>
			<ConfirmDialog
				open={asking}
				modal={false}
				title={created === null ? "Discard the draft?" : "Discard selected attachments?"}
				description={
					created === null
						? "Trellis deletes the title, the description, and the selected attachments."
						: `Trellis keeps ${created.identifier} and removes files that are not attached.`
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
