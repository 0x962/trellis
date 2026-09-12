import { ArrowsClockwise } from "@phosphor-icons/react";
import type { Ticket } from "@trellis/api";
import { Button, cx, useHotkey } from "@trellis/ui";
import { type MouseEvent, useCallback, useEffect, useRef, useState } from "react";
import { useArchivedProjects } from "../../../hooks/useArchivedProjects";
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

// The server text that the open editor started from, and its version.
type Base = { text: string; version: number };

// A row marked `descriptionStale` holds the old text at the new version.
// That text belongs to an older version, so its base takes the version
// before the row's, and a save from it meets the 412.
const baseOf = (row: Ticket): Base => ({
	text: row.description,
	version: row.descriptionStale === true ? row.version - 1 : row.version,
});

// The name of the last writer of the row, for the "changed the description"
// banner. The system actor and a row with no actor read as another actor.
const writerName = (row: Ticket) =>
	row.lastActor === null || row.lastActor.kind === "system" ? "Another actor" : row.lastActor.name;

// The description: formatted markdown until `e` or a click mounts the
// editor. While the editor is open, every save sends the version of the
// base, the server text the editor started from. So a description that
// another writer changed meets a 412, and the typed text never overwrites
// it. A change to another field of the row moves the base to the row's new
// version, because the text under the editor is still the server's text.
// While the cached row is marked stale, a save is refused. The notice
// stays until the person reloads or overwrites, also after a refetch
// clears the stale mark. A 412 keeps the typed text and shows the conflict
// notice above it.
export function Description({ ticket }: DescriptionProps) {
	const { queryClient, scheduler } = useApp();
	const { key, write } = useTicketWrite(ticket.identifier);
	const setStatus = useSaveStatusStore((state) => state.set);
	const [editing, setEditing] = useState(false);
	const [conflict, setConflict] = useState<Conflict | null>(null);
	const [remoteChanged, setRemoteChanged] = useState(false);
	const conflictRef = useRef<Conflict | null>(null);
	conflictRef.current = conflict;
	const latest = useRef(ticket);
	latest.current = ticket;
	const base = useRef<Base | null>(null);
	const editor = useRef<EditorHandle | null>(null);

	// The chunk loads while the page idles, so the first `e` is instant. The
	// load is idempotent, so a callback that runs after unmount costs nothing.
	useEffect(() => {
		editorChunk.retain();
		window.requestIdleCallback?.(() => void editorChunk.load());
		return editorChunk.release;
	}, []);

	// A ticket under an archived project takes no write, so `e` opens no editor.
	const readOnly = useArchivedProjects().isArchived(ticket.project.path);
	useHotkey("e", (event) => {
		if (readOnly) return;
		event.preventDefault();
		setEditing(true);
	});

	// A row whose description equals the base text moves the base to the
	// row's version. A stale row, or a row with other text, means another
	// writer changed the description.
	useEffect(() => {
		if (!editing || base.current === null) return;
		if (ticket.descriptionStale === true || ticket.description !== base.current.text) {
			setRemoteChanged(true);
			return;
		}
		base.current = { text: ticket.description, version: ticket.version };
	}, [editing, ticket.description, ticket.version, ticket.descriptionStale]);

	// `force` sends no version: Overwrite puts the typed text over the
	// server's text. A save that is not forced waits while the row is stale
	// or the conflict notice is open.
	const save = useCallback(
		async (markdown: string, force: boolean) => {
			const cached = queryClient.getQueryData<Ticket>(key)!;
			if (!force && (cached.descriptionStale === true || conflictRef.current !== null)) return;
			const expectedVersion = force ? undefined : base.current!.version;
			setStatus(ticket.identifier, "saving");
			try {
				await write(async (client) => {
					const result = await client.tickets.update({
						ticket: ticket.identifier,
						description: markdown,
						expectedVersion,
					});
					base.current = baseOf(result);
					return result;
				});
				setRemoteChanged(false);
				setStatus(ticket.identifier, "saved");
			} catch (error) {
				setStatus(ticket.identifier, "idle");
				const current = conflictCurrent(error);
				if (current !== null) {
					setConflict({ current, markdown });
					return;
				}
				failToast(`The description of ${ticket.identifier} is not saved.`, error, () => void save(markdown, force));
			}
		},
		[queryClient, key, write, setStatus, ticket.identifier],
	);

	// The autosave hook passes the row's version. A save sends the base
	// version, so the hook's version is not read.
	const autosaveSave = useCallback((markdown: string) => save(markdown, false), [save]);
	const autosave = useDescriptionAutosave({ ticket, save: autosaveSave, scheduler });

	// Puts the server's text into the editor and makes it the base.
	const rebase = (row: Ticket) => {
		editor.current?.setContent(row.description);
		base.current = baseOf(row);
		setRemoteChanged(false);
	};

	const reload = async () => {
		await queryClient.refetchQueries({ queryKey: key });
		rebase(queryClient.getQueryData<Ticket>(key)!);
	};

	const overwrite = async () => {
		const held = conflict!;
		setConflict(null);
		await save(held.markdown, true);
	};

	const closeConflict = () => {
		rebase(conflict!.current);
		setConflict(null);
	};

	// The editor loaded the text of the row it mounted with.
	const onReady = (handle: EditorHandle) => {
		editor.current = handle;
		base.current = baseOf(latest.current);
		setRemoteChanged(latest.current.descriptionStale === true);
	};

	const onClick = (event: MouseEvent) => {
		if ((event.target as HTMLElement).closest("a, img") !== null) return;
		setEditing(true);
	};

	return (
		<div className="flex flex-col gap-3">
			{(ticket.descriptionStale === true || remoteChanged) && conflict === null && (
				<div role="alert" className="flex h-9 items-center gap-2 rounded-md bg-warning-soft px-3 text-sm text-fg">
					<ArrowsClockwise aria-hidden="true" className="size-3.5 shrink-0 text-warning" />
					<span className="min-w-0 flex-1 truncate">{writerName(ticket)} changed the description.</span>
					<Button size="sm" variant="quiet" onClick={() => void reload()}>
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
					onReady={onReady}
				/>
			) : (
				// biome-ignore lint/a11y/noStaticElementInteractions: the `e` key is the keyboard route to the editor
				// biome-ignore lint/a11y/useKeyWithClickEvents: the `e` key is the keyboard route to the editor
				<div
					onClick={onClick}
					className={cx(
						"cursor-text",
						ticket.description.trim() === "" &&
							"-mx-2 min-h-24 rounded-md px-2 py-1.5 transition-colors duration-hover ease-out hover:bg-band",
					)}
				>
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
