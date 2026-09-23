import { ArrowClockwise, CaretLeft, CaretRight, Plus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { Note, Project } from "@trellis/api";
import { Badge, EmptyState, EntityCard, GroupHeader, IconButton, Skeleton, Tooltip } from "@trellis/ui";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { SettingsSection } from "../../project-settings/SettingsSection";
import { NoteSheet } from "./components/NoteSheet";
import { buildNotePage, nextNoteExpiryAt, orderNotesChildToRoot } from "./noteViews";

export function NotesSettings({ project }: { project: Project }) {
	const { orpc } = useApp();
	const readOnly = project.archivedAt !== null;
	const notes = useQuery(
		orpc.notes.list.queryOptions({ input: { project: project.key, includeExpired: true }, retry: false }),
	);
	const [editor, setEditor] = useState<{ note?: Note } | null>(null);
	const [requestedPage, setRequestedPage] = useState(0);
	const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
	const [expiryClock, setExpiryClock] = useState(() => Date.now());
	const now = Math.max(expiryClock, notes.dataUpdatedAt);
	useEffect(() => {
		const nextExpiry = nextNoteExpiryAt(notes.data ?? [], now);
		if (nextExpiry === null) return;
		const timer = setTimeout(() => setExpiryClock(Date.now()), Math.min(nextExpiry - now + 1, 2_147_483_647));
		return () => clearTimeout(timer);
	}, [notes.data, now]);
	const orderedNotes = useMemo(() => orderNotesChildToRoot(notes.data ?? []), [notes.data]);
	const notePage = useMemo(() => buildNotePage(orderedNotes, now, requestedPage), [orderedNotes, now, requestedPage]);

	return (
		<>
			<SettingsSection
				title="Notes"
				hint="Write notes for agents that work in this project."
				actions={
					readOnly ? undefined : (
						<Tooltip content="New note">
							<IconButton label="New note" icon={<Plus />} size="md" variant="primary" onClick={() => setEditor({})} />
						</Tooltip>
					)
				}
			>
				{notes.isPending ? (
					<div role="status" aria-label="Load notes" className="flex flex-col gap-3">
						<span className="sr-only">Load notes</span>
						<Skeleton className="h-24 w-full" />
						<Skeleton className="h-24 w-full" />
					</div>
				) : notes.isError ? (
					<div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-border p-4">
						<p className="text-sm text-danger">Could not load notes.</p>
						<Tooltip content="Retry loading notes">
							<IconButton
								label="Retry loading notes"
								icon={<ArrowClockwise />}
								disabled={notes.isFetching}
								onClick={() => void notes.refetch()}
							/>
						</Tooltip>
					</div>
				) : notes.data?.length === 0 ? (
					<EmptyState
						title="No notes yet"
						description="Write a note for the agents that start later in this project."
					/>
				) : (
					<div className="flex flex-col gap-8">
						{notePage.groups.map(({ projectKey, count, notes: members }) => {
							const expanded = !collapsedGroups.has(projectKey);
							const controls = `notes-${project.id}-${encodeURIComponent(projectKey)}`;
							return (
								<section key={projectKey} aria-label={`Notes of ${projectKey}`} className="flex flex-col gap-3">
									<GroupHeader
										group={projectKey}
										label={projectKey}
										count={count}
										expanded={expanded}
										controls={controls}
										onToggle={() =>
											setCollapsedGroups((current) => {
												const next = new Set(current);
												if (expanded) next.add(projectKey);
												else next.delete(projectKey);
												return next;
											})
										}
									/>
									{expanded && (
										<div id={controls} className="grid grid-cols-1 gap-4 md:grid-cols-2">
											{members.map(({ note, expired, audienceLabel }) => (
												<EntityCard
													key={note.id}
													title={note.title}
													description={note.body}
													badges={
														expired || note.audience !== "all" ? (
															<>
																{expired && <Badge tone="neutral">Expired</Badge>}
																{note.audience !== "all" && <Badge tone="agent">{audienceLabel}</Badge>}
															</>
														) : undefined
													}
													editLabel={readOnly ? `Read ${note.title}` : `Edit ${note.title}`}
													onEdit={() => setEditor({ note })}
												/>
											))}
										</div>
									)}
								</section>
							);
						})}
						{notePage.pageCount > 1 && (
							<nav aria-label="Notes pages" className="flex items-center justify-between gap-3">
								<p className="text-sm text-fg-muted tabular-nums">
									Notes {notePage.start + 1}–{notePage.end} of {notePage.total}
								</p>
								<div className="flex items-center gap-2">
									<Tooltip content="Previous notes page">
										<IconButton
											label="Previous notes page"
											icon={<CaretLeft />}
											disabled={notePage.index === 0}
											onClick={() => setRequestedPage(notePage.index - 1)}
										/>
									</Tooltip>
									<Tooltip content="Next notes page">
										<IconButton
											label="Next notes page"
											icon={<CaretRight />}
											disabled={notePage.index === notePage.pageCount - 1}
											onClick={() => setRequestedPage(notePage.index + 1)}
										/>
									</Tooltip>
								</div>
							</nav>
						)}
					</div>
				)}
			</SettingsSection>
			{editor !== null && (!readOnly || editor.note !== undefined) && (
				<NoteSheet project={project} note={editor.note} readOnly={readOnly} onClose={() => setEditor(null)} />
			)}
		</>
	);
}
