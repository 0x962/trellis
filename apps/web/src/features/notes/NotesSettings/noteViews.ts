import type { Note } from "@trellis/api";
import { noteAudiences } from "./components/NoteSheet/audiences";

export const NOTE_PAGE_SIZE = 50;

type NoteView = {
	note: Note;
	expired: boolean;
	audienceLabel: string;
};

type NoteGroup = {
	projectPath: string;
	count: number;
	notes: NoteView[];
};

const groupByProjectFromChildToRoot = <T extends { note: Note }>(notes: T[]) => {
	const groups = new Map<string, T[]>();
	for (const note of notes) {
		const group = groups.get(note.note.projectPath);
		if (group === undefined) groups.set(note.note.projectPath, [note]);
		else group.push(note);
	}
	return [...groups.entries()].sort(([a], [b]) => b.split(".").length - a.split(".").length);
};

// Keep a project's notes before the notes of its parent project.
export const orderNotesChildToRoot = (notes: Note[]): Note[] =>
	groupByProjectFromChildToRoot(notes.map((note) => ({ note }))).flatMap(([, members]) =>
		members.map(({ note }) => note),
	);

const toNoteView = (note: Note, now: number): NoteView => ({
	note,
	expired: note.expiresAt !== null && new Date(note.expiresAt).getTime() <= now,
	audienceLabel: noteAudiences.find((item) => item.value === note.audience)!.label,
});

export const nextNoteExpiryAt = (notes: Note[], now: number): number | null => {
	const futureExpiries = notes
		.flatMap((note) => (note.expiresAt === null ? [] : [new Date(note.expiresAt).getTime()]))
		.filter((expiry) => expiry > now);
	return futureExpiries.length === 0 ? null : Math.min(...futureExpiries);
};

export const buildNotePage = (orderedNotes: Note[], now: number, requestedPage: number) => {
	const pageCount = Math.ceil(orderedNotes.length / NOTE_PAGE_SIZE);
	const index = Math.min(requestedPage, Math.max(pageCount - 1, 0));
	const start = index * NOTE_PAGE_SIZE;
	const noteCountByProject = new Map<string, number>();
	for (const note of orderedNotes) {
		noteCountByProject.set(note.projectPath, (noteCountByProject.get(note.projectPath) ?? 0) + 1);
	}
	const visible = orderedNotes.slice(start, start + NOTE_PAGE_SIZE);
	const groups: NoteGroup[] = groupByProjectFromChildToRoot(visible.map((note) => toNoteView(note, now))).map(
		([projectPath, members]) => ({
			projectPath,
			count: noteCountByProject.get(projectPath)!,
			notes: members,
		}),
	);
	return { groups, index, pageCount, start, end: start + visible.length, total: orderedNotes.length };
};
