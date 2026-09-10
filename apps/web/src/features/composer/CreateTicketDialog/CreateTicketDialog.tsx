import { useRouter, useRouterState } from "@tanstack/react-router";
import type { Priority, Ticket, TicketSummary } from "@trellis/api";
import { Button, Dialog, Input, Kbd, toast, useHotkey } from "@trellis/ui";
import { useRef, useState } from "react";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { useApp } from "../../../lib/appContext";
import { parseSearch, serializeSearch } from "../../filters/grammar";
import { insertRow } from "../../table/utils/cacheRows";
import { failToast } from "../../ticket/utils/failToast";
import { composerActions, useComposerStore } from "../composerStore";
import { defaultStatus, useComposerDefaults } from "../hooks/useComposerDefaults";
import { useComposerDraft } from "../hooks/useComposerDraft";
import { ChipRow } from "./components/ChipRow";
import { DescriptionField } from "./components/DescriptionField";

const summaryOf = (ticket: Ticket): TicketSummary => {
	const { description, children, prs, attachments, ...summary } = ticket;
	return summary;
};

// The list routes take a peek param; every other page opens the full ticket.
const isList = (pathname: string) => pathname === "/all" || pathname.startsWith("/p/");

// The quick composer, product.md 6.1: title, description from the
// template, the chip row, Cmd+Enter to create, Cmd+Shift+Enter to create
// and stay. The draft survives an Escape.
export function CreateTicketDialog() {
	const options = useComposerStore((state) => state.options);
	const { client, queryClient, orpc } = useApp();
	const router = useRouter();
	const location = useRouterState({ select: (state) => state.location });
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
	const inFlight = useRef(false);

	const chosenProject = project ?? defaults.project;
	const bySlug = (slug: string | undefined) => defaults.statuses.find((entry) => entry.slug === slug);
	const chosenStatus = bySlug(status ?? defaults.status) ?? defaultStatus(defaults.statuses);
	const chosenPriority = priority ?? defaults.priority;
	const description = draft.description === "" ? defaults.template : draft.description;
	const dirty = draft.title.trim() !== "" || (draft.description !== "" && draft.description !== defaults.template);

	const openTicket = (identifier: string) => {
		if (isList(location.pathname)) {
			const search = serializeSearch({ ...parseSearch(location.search as Record<string, unknown>), peek: identifier });
			void router.navigate({ href: `${location.pathname}?${search}` });
		} else {
			void router.navigate({ href: `/t/${identifier}` });
		}
	};

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
			failToast("Couldn't create the ticket", error, () => void create(stay));
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
	};

	const requestClose = () => {
		if (dirty) setAsking(true);
		else {
			clearDraft();
			composerActions.close();
		}
	};

	useHotkey("mod+enter", () => void create(false));
	useHotkey("mod+shift+enter", () => void create(true));

	return (
		<Dialog open onOpenChange={(next) => !next && requestClose()} title="New ticket" size="lg">
			<Input
				label="Title"
				hideLabel
				autoFocus
				autoComplete="off"
				maxLength={500}
				placeholder="What needs to happen?"
				value={draft.title}
				onChange={(event) => setDraft({ ...draft, title: event.target.value })}
				className="h-9 text-lg"
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
			<div className="flex items-center justify-end gap-2">
				<Button variant="quiet" onClick={requestClose}>
					Cancel
				</Button>
				<Button disabled={creating} onClick={() => void create(true)}>
					Create and add another <Kbd className="ml-1">⌘⇧↩</Kbd>
				</Button>
				<Button variant="primary" disabled={creating} onClick={() => void create(false)} kbd="⌘↩">
					Create
				</Button>
			</div>
			<ConfirmDialog
				open={asking}
				modal={false}
				title="Discard the draft?"
				description="The title and the description are lost."
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
