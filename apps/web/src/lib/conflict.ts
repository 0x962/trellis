import { ORPCError } from "@orpc/client";
import type { Ticket } from "@trellis/api";

// The 412 a conditional write raises. Another actor wrote the ticket
// between the read and the write.
export const isConflict = (error: unknown): error is ORPCError<"VERSION_CONFLICT", { current: Ticket }> =>
	error instanceof ORPCError && error.code === "VERSION_CONFLICT";

// The 412 a conditional write raises. `current` is the row as the server
// holds it now, so a reload needs no refetch.
export const conflictCurrent = (error: unknown): Ticket | null => (isConflict(error) ? error.data.current : null);

// The one sentence the table, the board, and the palette show after a
// conflict. The mobile app holds the same sentence in
// `apps/mobile/src/ticket/ticketUpdate/ticketUpdate.ts`, because it cannot
// import this file. `subject` is the ticket identifier of a single write,
// or the row count of a batch write. The caller puts `current` in the
// cache before it shows this text, so the row on screen holds the version
// the other actor wrote.
export const conflictMessage = (subject: string | number): string =>
	typeof subject === "number"
		? `${subject} tickets changed first. The rows show the other version.`
		: `${subject} changed first. The row shows the other version.`;

// The message the server sent, for a toast. A non-API failure shows its
// own message.
export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
