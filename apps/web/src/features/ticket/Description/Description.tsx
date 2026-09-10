import type { Ticket } from "@trellis/api";
import { Button, useHotkey } from "@trellis/ui";
import { type MouseEvent, useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { conflictCurrent } from "../../../lib/conflict";
import { ConflictNotice } from "../components/ConflictNotice";
import { useTicketWrite } from "../hooks/useTicketWrite";
import { useSaveStatusStore } from "../stores/saveStatusStore";
import { failToast } from "../utils/failToast";
import { type EditorHandle, editorChunk, LazyEditor } from "./components/LazyEditor";
import { ReadOnlyMarkdown } from "./components/ReadOnlyMarkdown";
import { useDescriptionAutosave } from "./hooks/useDescriptionAutosave";

export type DescriptionProps = {
	ticket: Ticket;
};

type Conflict = { current: Ticket; markdown: string };

// The description: formatted markdown until `e` or a click mounts the
// editor. The editor autosaves with the row's version. While the cached
// row is marked stale, a save is refused and Reload brings the server text.
// A 412 keeps the typed text and shows the conflict notice above it.
export function Description({ ticket }: DescriptionProps) {
	const { queryClient, scheduler } = useApp();
	const { key, write } = useTicketWrite(ticket.identifier);
	const setStatus = useSaveStatusStore((state) => state.set);
	const [editing, setEditing] = useState(false);
	const [conflict, setConflict] = useState<Conflict | null>(null);
	const conflictRef = useRef<Conflict | null>(null);
	conflictRef.current = conflict;
	const editor = useRef<EditorHandle | null>(null);

	// The chunk loads while the page idles, so the first `e` is instant. The
	// load is idempotent, so a callback that runs after unmount costs nothing.
	useEffect(() => {
		editorChunk.retain();
		window.requestIdleCallback?.(() => void editorChunk.load());
		return editorChunk.release;
	}, []);

	useHotkey("e", (event) => {
		event.preventDefault();
		setEditing(true);
	});

	const save = useCallback(
		async (markdown: string, expectedVersion: number | undefined) => {
			const cached = queryClient.getQueryData<Ticket>(key)!;
			if (cached.descriptionStale === true || conflictRef.current !== null) return;
			setStatus(ticket.identifier, "saving");
			try {
				await write((client) =>
					client.tickets.update({ ticket: ticket.identifier, description: markdown, expectedVersion }),
				);
				setStatus(ticket.identifier, "saved");
			} catch (error) {
				setStatus(ticket.identifier, "idle");
				const current = conflictCurrent(error);
				if (current !== null) {
					setConflict({ current, markdown });
					return;
				}
				failToast(`Couldn't save ${ticket.identifier}`, error, () => void save(markdown, expectedVersion));
			}
		},
		[queryClient, key, write, setStatus, ticket.identifier],
	);

	const autosave = useDescriptionAutosave({ ticket, save, scheduler });

	const reload = async () => {
		await queryClient.refetchQueries({ queryKey: key });
		editor.current?.setContent(queryClient.getQueryData<Ticket>(key)!.description);
	};

	const overwrite = async () => {
		const held = conflict!;
		// `save` reads conflictRef.current before the next render, so the ref
		// clears here, or the save sees the conflict and sends nothing.
		conflictRef.current = null;
		setConflict(null);
		await save(held.markdown, undefined);
	};

	const closeConflict = () => {
		editor.current?.setContent(conflict!.current.description);
		setConflict(null);
	};

	const onClick = (event: MouseEvent) => {
		if ((event.target as HTMLElement).closest("a") !== null) return;
		setEditing(true);
	};

	return (
		<div className="flex flex-col gap-3">
			{ticket.descriptionStale === true && (
				<div
					role="alert"
					className="flex min-h-9 items-center gap-2 rounded-md border border-warning bg-warning-soft px-3 py-1.5 text-sm text-fg"
				>
					<span className="flex-1">An agent changed the description. Reload to see it.</span>
					<Button size="sm" onClick={() => void reload()}>
						Reload
					</Button>
				</div>
			)}
			{conflict !== null && (
				<ConflictNotice current={conflict.current} onOverwrite={() => void overwrite()} onClose={closeConflict} />
			)}
			{editing ? (
				<LazyEditor
					markdown={ticket.description}
					contentKey={ticket.identifier}
					onChange={autosave.onChange}
					onBlur={autosave.onBlur}
					onReady={(handle) => {
						editor.current = handle;
					}}
				/>
			) : (
				// biome-ignore lint/a11y/noStaticElementInteractions: the `e` key is the keyboard route to the editor
				// biome-ignore lint/a11y/useKeyWithClickEvents: the `e` key is the keyboard route to the editor
				<div onClick={onClick} className="cursor-text">
					{ticket.description.trim() === "" ? (
						<div className="markdown text-md">
							<p className="text-fg-faint">Describe the work. Agents read this verbatim.</p>
						</div>
					) : (
						<ReadOnlyMarkdown markdown={ticket.description} className="text-md" />
					)}
				</div>
			)}
		</div>
	);
}
