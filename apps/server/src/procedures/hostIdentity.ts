import { call, type ProcedureContext } from "./base.ts";

export const describeHostIdentity = (context: ProcedureContext) => call(context, "hostIdentity.describe", {});
