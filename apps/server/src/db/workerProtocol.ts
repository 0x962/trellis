import type { GhStatus, TrellisEvent } from "@trellis/api";
import type { Config } from "../config.ts";
import type { RequestContext } from "../context.ts";
import type { GhResult, GhSlot } from "../gh/run.ts";
import type { DbTiming } from "../serverTiming.ts";
import type { ServiceKind, ServiceName } from "../services/registry.ts";
import type { Runtime } from "./transport.ts";

export type WorkerCall = {
	type: "call";
	id: number;
	kind: ServiceKind;
	clientId?: string;
	name: ServiceName;
	ctx: RequestContext;
	input: unknown;
	ghStatus: GhStatus;
};

type WorkerRuntime = Pick<Runtime, "version" | "bootId"> & { ghBin: string; ghTimeoutMs: number };

export type WorkerInput =
	| { type: "start"; config: Config; runtime: WorkerRuntime; jobs: { clockRate: number } | null }
	| { type: "calls"; calls: WorkerCall[] }
	| { type: "ghResult"; id: number; result: GhResult }
	| { type: "addressesResult"; id: number; addresses: string[] }
	| { type: "pull"; id: number }
	| { type: "cancel"; id: number }
	| { type: "close" };

export type SerializedError = {
	name: string;
	message: string;
	code?: string;
	status?: number;
	defined?: boolean;
	data?: unknown;
};

export type WorkerOutput =
	| { type: "ready"; applied: number; liveShas: string[] }
	| { type: "startError"; error: SerializedError }
	| { type: "result"; id: number; result: unknown; timing: DbTiming }
	| { type: "error"; id: number; error: SerializedError; timing: DbTiming }
	| { type: "event"; event: TrellisEvent }
	| { type: "gh"; id: number; slot: GhSlot; args: string[] }
	| { type: "addresses"; id: number }
	| { type: "stream"; id: number }
	| { type: "chunk"; id: number; chunk: Uint8Array<ArrayBuffer> }
	| { type: "streamEnd"; id: number }
	| { type: "log"; msg: string; fields?: Record<string, unknown> }
	| { type: "closed" };
