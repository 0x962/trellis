import { useRouter } from "@tanstack/react-router";
import type { Priority, Ticket, TicketSummary } from "@trellis/api";
import { Button, ConfirmDialog, Dialog, Switch, toast, useHotkey } from "@trellis/ui";
import { useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { failToast } from "../../../lib/failToast";
import { PendingFiles, uploadPendingFiles } from "../../attachments/PendingFiles";
import { uploadErrorText } from "../../attachments/utils/uploadErrorText";
import { insertRow } from "../../table/utils/cacheRows";
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

// The quick composer: title, description from the
// template, the chip row, Cmd+Enter to create, Cmd+Shift+Enter to create
// and stay. With Create more on, every create stays. The draft survives an
// Escape.
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
	// Files picked before the ticket exists. They stay in the browser and
	// upload after the create answers.
	const [pending, setPending] = useState<File[]>([]);
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
		pending.length > 0;

	const openTicket = (identifier: string) => void router.navigate({ href: `/t/${identifier}` });

	// One create at a time. Two hotkey presses can land in one tick, before
	// `creating` renders, so the ref holds the guard and the state disables
	// the buttons. A refused create keeps the draft and the dialog open.
	const create = async (stay: boolean) => {
		const title = draft.title.trim();
		if (chosenProject === undefined) {
			setProjectMissing(true);
			return;
		}
		if (title === "" || inFlight.current) return;
		const parentRef = parent === undefined ? defaults.parent : (parent?.identifier ?? undefined);
		inFlight.current = true;
		setCreating(true);
		try {
			let ticket: Ticket;
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
			// The guard stays up while the held files upload, so a second
			// submit cannot create the ticket twice.
			const failed = await uploadPendingFiles((input) => client.attachments.upload(input), ticket.identifier, pending);
			setPending([]);
			if (failed.length > 0) {
				await queryClient.invalidateQueries({
					queryKey: orpc.attachments.list.queryKey({ input: { ticket: ticket.identifier } }),
					refetchType: "all",
				});
			}
			insertRow(queryClient, summaryOf(ticket));
			void queryClient.invalidateQueries({ queryKey: orpc.tickets.counts.key() });
			void queryClient.invalidateQueries({ queryKey: orpc.projects.key() });
			const open = { label: "Open", onClick: () => openTicket(ticket.identifier) };
			if (failed.length === 0) {
				toast.success(`Created ${ticket.identifier}`, { action: open });
			} else {
				toast.error(`Created ${ticket.identifier} without ${failed.length === 1 ? "one file" : "some files"}.`, {
					description: failed.map((entry) => uploadErrorText(entry.name, entry.error)).join(" "),
					action: open,
				});
			}
			clearDraft();
		} finally {
			inFlight.current = false;
			setCreating(false);
		}
		if (!stay) {
			composerActions.close();
			return;
		}
		setEditing(false);
		setEditorKey((key) => key + 1);
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
			<div className="flex min-h-0 flex-col">
				<div className="border-b border-border p-4">
					<ComposerHeader project={chosenProject} onClose={requestClose} />
				</div>
				<div className="flex flex-1 flex-col gap-4 p-6 max-md:p-4">
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
					<PendingFiles
						files={pending}
						onAdd={(next) => setPending((current) => [...current, ...next])}
						onRemove={(index) => setPending((current) => current.filter((_, at) => at !== index))}
					/>
				</div>
				<div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-border bg-surface p-4">
					<Switch
						label="Create more"
						checked={createMore}
						onCheckedChange={setCreateMore}
						className="text-xs text-fg-muted"
					/>
					<Button variant="primary" size="md" disabled={creating} onClick={() => void create(createMore)} kbd="⌘↩">
						Create
					</Button>
				</div>
			</div>
			<ConfirmDialog
				open={asking}
				modal={false}
				title="Discard the draft?"
				description="trellis deletes the title and the description."
				confirmLabel="Discard"
				danger
				onConfirm={() => {
					setAsking(false);
					clearDraft();
					setPending([]);
					composerActions.close();
				}}
				onCancel={() => setAsking(false)}
			/>
		</Dialog>
	);
}
