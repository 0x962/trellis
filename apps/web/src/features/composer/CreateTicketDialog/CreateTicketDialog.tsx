import { useRouter } from "@tanstack/react-router";
import type { Priority, Ticket, TicketSummary } from "@trellis/api";
import { Button, ConfirmDialog, Dialog, Kbd, Switch, toast, useHotkey } from "@trellis/ui";
import { useId, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { failToast } from "../../../lib/failToast";
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

// The quick composer keeps its text in sessionStorage until a create or a
// confirmed discard. Cmd+Enter creates one ticket, and Cmd+Shift+Enter keeps
// the composer open for another ticket.
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
	const [titleMissing, setTitleMissing] = useState(false);
	const [projectMissing, setProjectMissing] = useState(false);
	const [asking, setAsking] = useState(false);
	const [editorKey, setEditorKey] = useState(0);
	const [creating, setCreating] = useState(false);
	const [createMore, setCreateMore] = useState(false);
	const inFlight = useRef(false);
	const titleRef = useRef<HTMLInputElement>(null);
	const titleId = useId();
	const titleErrorId = useId();

	const chosenProject = project ?? defaults.project;
	const bySlug = (slug: string | undefined) => defaults.statuses.find((entry) => entry.slug === slug);
	const chosenStatus = bySlug(status ?? defaults.status) ?? defaultStatus(defaults.statuses);
	const chosenPriority = priority ?? defaults.priority;
	const description = draft.description === "" ? defaults.template : draft.description;
	const dirty = draft.title.trim() !== "" || (draft.description !== "" && draft.description !== defaults.template);

	const openTicket = (identifier: string) => void router.navigate({ href: `/t/${identifier}` });

	// One create at a time. Two hotkey presses can land in one tick, before
	// `creating` renders, so the ref holds the guard and the state disables
	// the button. A refused create keeps the draft and the dialog open.
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
		} finally {
			inFlight.current = false;
			setCreating(false);
		}
		insertRow(queryClient, summaryOf(ticket));
		void queryClient.invalidateQueries({ queryKey: orpc.tickets.counts.key() });
		void queryClient.invalidateQueries({ queryKey: orpc.projects.key() });
		toast.success(`Created ${ticket.identifier}`, {
			action: { label: "Open", onClick: () => openTicket(ticket.identifier) },
		});
		clearDraft();
		if (!stay) {
			composerActions.close();
			return;
		}
		setEditing(false);
		setEditorKey((key) => key + 1);
		titleRef.current?.focus();
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
			<div className="flex min-h-0 flex-col gap-2 p-3">
				<ComposerHeader onClose={requestClose} />
				<div className="flex flex-col rounded-lg border border-border bg-elevated">
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
						onProject={(next) => {
							setProject(next);
							setProjectMissing(false);
						}}
						onStatus={(next) => setStatus(next.slug)}
						onPriority={setPriority}
						onParent={setParent}
					/>
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
							Create ticket
						</Button>
					</div>
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
					composerActions.close();
				}}
				onCancel={() => setAsking(false)}
			/>
		</Dialog>
	);
}
