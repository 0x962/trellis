import { oc } from "@orpc/contract";
import { pickErrors } from "../errors.ts";

// Every procedure starts here. The actor header is checked before any
// handler runs, every input is validated, and every ref can miss, so all
// four codes are declared on all 46 procedures.
export const base = oc.errors(pickErrors(["ACTOR_REQUIRED", "ACTOR_INVALID", "INPUT_VALIDATION_FAILED", "NOT_FOUND"]));
