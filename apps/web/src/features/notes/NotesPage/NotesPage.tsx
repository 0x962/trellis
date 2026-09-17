import { Plus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { Note, Project } from "@trellis/api";
import { Badge, Button, EmptyState, EntityCard, IconButton, Skeleton } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { PageTitle } from "../../shell/PageTitle";
import { ProjectBreadcrumb } from "../../shell/ProjectBreadcrumb";
import { Topbar } from "../../shell/Topbar";
import { NoteSheet } from "./components/NoteSheet";
import { noteAudiences } from "./components/NoteSheet/audiences";

// The list holds the notes of the project and of every ancestor. One
// section per owning project, the project itself first, then each ancestor
// up to the root, in the order the API returns them.
const groupByProject = (notes: Note[]) => {
	const groups = new Map<string, Note[]>();
	for (const note of notes) groups.set(note.projectPath, [...(groups.get(note.projectPath) ?? []), note]);
	return [...groups.entries()].sort(([a], [b]) => b.split(".").length - a.split(".").length);
};

// The notes page of a project: every note an agent of this project reads,
// with a sheet to write, change, or delete one.
export function NotesPage({ project }: { project: Project }) {
	const { orpc } = useApp();
	const readOnly = project.archivedAt !== null;
	const notes = useQuery(
		orpc.notes.list.queryOptions({ input: { project: project.path, includeExpired: true }, retry: false }),
	);
	const [editor, setEditor] = useState<{ note?: Note } | null>(null);
	const now = Date.now();

	return (
		<>
			<Topbar
				actions={
					readOnly ? undefined : (
						<IconButton label="New note" icon={<Plus />} size="md" variant="primary" onClick={() => setEditor({})} />
					)
				}
			>
				<PageTitle parent={<ProjectBreadcrumb project={project} />} title="Notes" />
			</Topbar>
			{notes.data?.length === 0 ? (
				<EmptyState
					variant="page"
					className="page-card"
					title="No notes yet"
					description="Write a note for the agents that start later in this project."
				/>
			) : (
				<div className="page-card flex-1 overflow-y-auto px-8 py-6 max-md:px-4">
					<div className="flex max-w-7xl flex-col gap-6">
						{notes.isPending ? (
							<div role="status" aria-label="Load notes" className="flex flex-col gap-3">
								<span className="sr-only">Load notes</span>
								<Skeleton className="h-24 w-full" />
								<Skeleton className="h-24 w-full" />
							</div>
						) : notes.isError ? (
							<div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-border p-4">
								<p className="text-sm text-danger">Could not load notes.</p>
								<Button disabled={notes.isFetching} onClick={() => void notes.refetch()}>
									Retry
								</Button>
							</div>
						) : (
							<div className="flex flex-col gap-8">
								{groupByProject(notes.data).map(([projectPath, members]) => (
									<section key={projectPath} aria-label={`Notes of ${projectPath}`} className="flex flex-col gap-3">
										<header className="flex items-center gap-2">
											<h2 className="text-xl font-medium text-fg">{projectPath}</h2>
										</header>
										<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
											{members.map((note) => {
												const expired = note.expiresAt !== null && new Date(note.expiresAt).getTime() <= now;
												const audience = noteAudiences.find((item) => item.value === note.audience)!;
												return (
													<div key={note.id} className="flex flex-col gap-2">
														<EntityCard
															title={note.title}
															description={note.body}
															editLabel={readOnly ? `Read ${note.title}` : `Edit ${note.title}`}
															onEdit={() => setEditor({ note })}
														/>
														{(expired || note.audience !== "all") && (
															<div className="flex gap-2">
																{expired && <Badge tone="neutral">Expired</Badge>}
																{note.audience !== "all" && <Badge tone="agent">{audience.label}</Badge>}
															</div>
														)}
													</div>
												);
											})}
										</div>
									</section>
								))}
							</div>
						)}
					</div>
				</div>
			)}
			{editor !== null && !readOnly && (
				<NoteSheet project={project} note={editor.note} onClose={() => setEditor(null)} />
			)}
		</>
	);
}
