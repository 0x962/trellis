import type { Tx } from "../../db/tx.ts";
import * as agentRuns from "../agentRuns/agentRuns.ts";
import * as sessions from "../sessions/sessions.ts";
import type { IoCtx, PrepareCtx } from "../support.ts";

// The `family` selects the context shape. The `kind` sets the worker queue
// priority before the service starts its transaction.
// biome-ignore lint/suspicious/noExplicitAny: the core context comes from context.ts; the transport builds it.
type CoreRun = (ctx: any, tx: Tx, input: any) => Promise<unknown>;
// An `io` transaction gets an IoCtx, which has no gh runner. A run step that
// asks for `gh` fails the typecheck here.
// biome-ignore lint/suspicious/noExplicitAny: each service parses its own input.
export type Run = (ctx: IoCtx, tx: Tx, input: any) => Promise<unknown>;
// biome-ignore lint/suspicious/noExplicitAny: same as Run, for a service that yields lines.
type Stream = (ctx: IoCtx, tx: Tx, input: any) => AsyncGenerator<string>;
// `prepare` does the slow work outside the database, such as a gh call,
// before the transaction of `run` opens. Its result is the input of `run`.
// It reads the database through `ctx.newTx`, in short transactions of its
// own, so other calls use the database while gh runs.
// biome-ignore lint/suspicious/noExplicitAny: same as Run, with no transaction.
type Prepare = (ctx: IoCtx & PrepareCtx, input: any) => Promise<unknown>;

export type ServiceKind = "mutation" | "read" | "search";
export type ServiceEntry =
	| { family: "core"; kind: ServiceKind; run: CoreRun }
	| { family: "io"; kind: ServiceKind; run: Run }
	| { family: "io"; kind: ServiceKind; prepare: Prepare; run: Run }
	| { family: "io"; kind: ServiceKind; stream: Stream };

export const core = (kind: ServiceKind, run: CoreRun): ServiceEntry => ({ family: "core", kind, run });
export const io = (kind: ServiceKind, run: Run): ServiceEntry => ({ family: "io", kind, run });
export const prepared = (kind: ServiceKind, prepare: Prepare, run: Run): ServiceEntry => ({
	family: "io",
	kind,
	prepare,
	run,
});
export const agentMutation = (prepare: Prepare) =>
	prepared(
		"mutation",
		async (ctx, input) => agentRuns.observeResult(ctx, (await prepare(ctx, input)) as { id: string }),
		agentRuns.finish,
	);

// A session mutation that launches a harness answers before the launch ends,
// so it reads the accepted state. `sessions.accepted` reports `starting` for a
// launch that still runs, in place of a runtime read that finds no process.
export const sessionMutation = (prepare: Prepare) =>
	prepared(
		"mutation",
		async (ctx, input) => sessions.accepted(ctx, (await prepare(ctx, input)) as { id: string }),
		sessions.finish,
	);
