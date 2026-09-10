import { ORPCError } from "@orpc/client";
import type { Ticket } from "@trellis/api";

// The 412 a conditional write raises. `current` is the row as the server
// holds it now, so a reload needs no refetch.
export const conflictCurrent = (error: unknown): Ticket | null =>
	error instanceof ORPCError && error.code === "VERSION_CONFLICT" ? (error.data as { current: Ticket }).current : null;

// The message the server sent, for a toast. A non-API failure shows its
// own message.
export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
