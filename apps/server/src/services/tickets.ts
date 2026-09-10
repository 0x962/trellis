// The ticket service: every procedure under `tickets.*`. Each function is
// `(ctx, tx, input)`, throws the contract errors, writes activity under one
// batch id, and emits TicketSummary events on the transaction collector.
export { create } from "./tickets/create.ts";
export { update, updateMany } from "./tickets/update.ts";
export { move } from "./tickets/move.ts";
