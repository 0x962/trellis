// This entry point exports every service under `tickets.*`.

export { setContract } from "./tickets/contract.ts";
export { create } from "./tickets/create.ts";
export { dependencies } from "./tickets/dependencies";
export { updateDependencies } from "./tickets/deps.ts";
export { importContract } from "./tickets/importContract.ts";
export { importDependencies } from "./tickets/importDeps.ts";
export { move } from "./tickets/move.ts";
export { setOutcome } from "./tickets/outcome.ts";
export { boardOf as board, countsOf as counts, get, list, resolveTicketAge } from "./tickets/read.ts";
export { readDependencyOutcomes } from "./tickets/readDependencyOutcomes";
export { delete, deleteMany } from "./tickets/remove.ts";
export { update, updateMany } from "./tickets/update.ts";
