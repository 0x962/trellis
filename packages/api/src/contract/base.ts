import { oc } from "@orpc/contract";
import { pickErrors } from "../errors.ts";

// Every procedure starts here. The server checks the actor header before any
// handler runs, and it validates every input. Every ref can miss. So all 55
// procedures declare these four codes.
export const base = oc.errors(pickErrors(["ACTOR_REQUIRED", "ACTOR_INVALID", "INPUT_VALIDATION_FAILED", "NOT_FOUND"]));
