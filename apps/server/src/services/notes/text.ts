import type { Note } from "@trellis/api";

// A launch prompt and a brief carry at most this many notes. The rest is one
// `trellis notes list` away, and the text says so.
export const NOTES_PROMPT_LIMIT = 40;

// The markdown lines of the notes an agent reads at start: one list item
// per note with its title, its last writer, and its times, then the body
// indented under it, as the brief prints a comment. The item names the
// project that owns the note.
export const notesLines = (notes: Note[], projectKey: string): string[] => {
	if (notes.length === 0) return [];
	const lines = ["## Project notes", ""];
	for (const note of notes.slice(0, NOTES_PROMPT_LIMIT)) {
		const expiry = note.expiresAt === null ? "" : `, expires ${note.expiresAt}`;
		lines.push(
			`- ${note.title} (${note.projectKey}, ${note.actor.displayName ?? note.actor.name}, updated ${note.updatedAt}${expiry}):`,
		);
		for (const line of note.body.split("\n")) lines.push(`  ${line}`);
	}
	if (notes.length > NOTES_PROMPT_LIMIT)
		lines.push(`- ${notes.length - NOTES_PROMPT_LIMIT} more: trellis notes list ${projectKey}`);
	return lines;
};
