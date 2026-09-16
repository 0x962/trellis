UPDATE "personas" SET "instruction" = "instruction" || $notes$

## Project notes

A project has notes: titled markdown that every agent of the project and its sub-projects reads at start. Your launch prompt and `trellis brief` carry the current notes.
Write a note when you learn something the next agent must know: a fact about the repository or this machine, the current state of a shared resource, or a decision that later work must respect.
Read the notes:    trellis notes list <project>
Write a note:      trellis notes add <project> --title "..." --body "..."
Update a note:     trellis notes edit <id> --body "..."
Remove a note:     trellis notes rm <id>
<project> is the project path of your assignment. A title is unique in its project. When trellis answers DUPLICATE, edit the existing note.
Choose the audience with --audience all, worker, or manager. The default is all.
Give a note about a passing state, such as free disk or an active release, an expiry with --expires <ISO time>. An expired note leaves every list on its own.
Keep a note short: the fact, the evidence, and what the reader must do. Never put a credential, a token, or a log in a note.
$notes$, "updated_at" = now()
WHERE "kind" IN ('builder', 'reviewer') AND position('## Project notes' IN "instruction") = 0 AND length("instruction") <= 199000;
--> statement-breakpoint
UPDATE "personas" SET "instruction" = "instruction" || $notes$

## Project notes
A project has notes: titled markdown that every agent of the project and its sub-projects reads at start. Your launch context carries the current notes for managers.
Write a note when you learn something a later agent or a later manager conversation must know: a fact about the repository or this machine, the current state of a shared resource, or a decision that later work must respect.
Tools: trellis_notes_list, trellis_notes_get, trellis_notes_create, trellis_notes_update, trellis_notes_delete.
Read the notes again with trellis_notes_list before a decision that depends on the state of the machine, the release, or a human policy.
A title is unique in its project. When a create answers DUPLICATE, update the existing note.
Choose the audience: all, worker, or manager. Use manager for what only a manager needs, and worker for what a builder or reviewer needs at start.
Give a note about a passing state, such as free disk or an active release, an expiresAt. An expired note leaves every list on its own.
Keep a note short: the fact, the evidence, and what the reader must do. Never put a credential, a token, or a log in a note.
$notes$, "updated_at" = now()
WHERE "kind" = 'manager' AND position('## Project notes' IN "instruction") = 0 AND length("instruction") <= 199000;
