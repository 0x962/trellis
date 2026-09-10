import { useRouter, useRouterState } from "@tanstack/react-router";
import type { Priority, Status, Ticket, TicketSummary } from "@trellis/api";
import { Button, Dialog, Input, Kbd, toast, useHotkey } from "@trellis/ui";
import { useState } from "react";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { useApp } from "../../../lib/appContext";
import { parseSearch, serializeSearch } from "../../filters/grammar";
import { insertRow } from "../../table/utils/cacheRows";
import { closeComposer, useComposerStore } from "../composerStore";
import { useComposerDefaults } from "../hooks/useComposerDefaults";
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
	const defaults = useComposerDefaults(options);
	const { draft, setDraft, clearDraft } = useComposerDraft();
	const [project, setProject] = useState<string | undefined>();
	const [status, setStatus] = useState<Status | undefined>();
	const [priority, setPriority] = useState<Priority | undefined>();
	const [parent, setParent] = useState<TicketSummary | null | undefined>();
	const [editing, setEditing] = useState(draft.description !== "");
	const [projectMissing, setProjectMissing] = useState(false);
	const [asking, setAsking] = useState(false);
	const [editorKey, setEditorKey] = useState(0);

	const chosenProject = project ?? defaults.project;
	const chosenStatus = status ?? defaults.statuses.find((entry) => entry.slug === defaults.status);
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

	const create = async (stay: boolean) => {
		const title = draft.title.trim();
		if (chosenProject === undefined) {
			setProjectMissing(true);
			return;
		}
		if (title === "") return;
		const parentRef = parent === undefined ? defaults.parent : (parent?.identifier ?? undefined);
		const ticket = await client.tickets.create({
			project: chosenProject,
			title,
			status: chosenStatus?.slug,
			priority: chosenPriority,
			...(parentRef === undefined ? {} : { parent: parentRef }),
			...(editing ? { description } : {}),
		});
		insertRow(queryClient, summaryOf(ticket));
		void queryClient.invalidateQueries({ queryKey: orpc.tickets.counts.key() });
		void queryClient.invalidateQueries({ queryKey: orpc.projects.key() });
		toast.success(`Created ${ticket.identifier}`, {
			action: { label: "Open", onClick: () => openTicket(ticket.identifier) },
		});
		clearDraft();
		if (!stay) {
			closeComposer();
			return;
		}
		setEditing(false);
		setEditorKey((key) => key + 1);
	};

	const requestClose = () => {
		if (dirty) setAsking(true);
		else {
			clearDraft();
			closeComposer();
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
				onProject={(ref) => {
					setProject(ref);
					setStatus(undefined);
				}}
				onStatus={setStatus}
				onPriority={setPriority}
				onParent={setParent}
			/>
			<div className="flex items-center justify-end gap-2">
				<Button variant="quiet" onClick={requestClose}>
					Cancel
				</Button>
				<Button onClick={() => void create(true)}>
					Create and add another <Kbd className="ml-1">⌘⇧↩</Kbd>
				</Button>
				<Button variant="primary" onClick={() => void create(false)} kbd="⌘↩">
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
					closeComposer();
				}}
				onCancel={() => setAsking(false)}
			/>
		</Dialog>
	);
}
