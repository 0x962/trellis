// This entry point exports every service under `tickets.*`.
export { create } from "./tickets/create.ts";
export { updateDependencies } from "./tickets/deps.ts";
export { importDependencies } from "./tickets/importDeps.ts";
export { move } from "./tickets/move.ts";
export { boardOf as board, countsOf as counts, get, list, resolveTicketAge } from "./tickets/read.ts";
export { delete, deleteMany } from "./tickets/remove.ts";
export { update, updateMany } from "./tickets/update.ts";
