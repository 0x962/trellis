import type { Tx } from "../db/tx.ts";
import * as actors from "./actors.ts";
import * as attachments from "./attachments.ts";
import * as brief from "./brief.ts";
import * as comments from "./comments.ts";
import * as inbox from "./inbox.ts";
import * as projects from "./projects.ts";
import * as pullRequests from "./pullRequests.ts";
import * as search from "./search.ts";
import * as settings from "./settings.ts";
import * as statuses from "./statuses.ts";
import * as system from "./system.ts";
import * as tickets from "./tickets.ts";
import * as timeline from "./timeline.ts";

// The `family` selects the context shape. The `kind` sets the worker queue
// priority before the service starts its transaction.
// biome-ignore lint/suspicious/noExplicitAny: each family has its own ctx type; the transport builds the right one.
type Run = (ctx: any, tx: Tx, input: any) => Promise<unknown>;
// biome-ignore lint/suspicious/noExplicitAny: same as Run, for a service that yields lines.
type Stream = (ctx: any, tx: Tx, input: any) => AsyncGenerator<string>;
// `prepare` does the slow work outside the database, such as a gh call,
// before the transaction of `run` opens. Its result is the input of `run`.
// It reads the database through `ctx.newTx`, in short transactions of its
// own, so other calls use the database while gh runs.
// biome-ignore lint/suspicious/noExplicitAny: same as Run, with no transaction.
type Prepare = (ctx: any, input: any) => Promise<unknown>;

export type ServiceKind = "mutation" | "read" | "search";
export type ServiceEntry =
	| { family: "core"; kind: ServiceKind; run: Run }
	| { family: "io"; kind: ServiceKind; run: Run }
	| { family: "io"; kind: ServiceKind; prepare: Prepare; run: Run }
	| { family: "io"; kind: ServiceKind; stream: Stream };

const core = (kind: ServiceKind, run: Run): ServiceEntry => ({ family: "core", kind, run });
const io = (kind: ServiceKind, run: Run): ServiceEntry => ({ family: "io", kind, run });
const prepared = (kind: ServiceKind, prepare: Prepare, run: Run): ServiceEntry => ({
	family: "io",
	kind,
	prepare,
	run,
});

export const services = {
	"projects.list": core("read", projects.list),
	"projects.get": core("read", projects.get),
	"projects.create": core("mutation", projects.create),
	"projects.update": core("mutation", projects.update),
	"projects.move": core("mutation", projects.move),
	"projects.delete": core("mutation", projects.delete),
	"projects.setRepos": core("mutation", projects.setRepos),
	"statuses.list": core("read", statuses.list),
	"statuses.create": core("mutation", statuses.create),
	"statuses.update": core("mutation", statuses.update),
	"statuses.reorder": core("mutation", statuses.reorder),
	"statuses.delete": core("mutation", statuses.delete),
	"statuses.clear": core("mutation", statuses.clear),
	"tickets.list": core("read", tickets.list),
	"tickets.counts": core("read", tickets.counts),
	"tickets.board": core("read", tickets.board),
	"tickets.get": core("read", tickets.get),
	"tickets.create": core("mutation", tickets.create),
	"tickets.update": core("mutation", tickets.update),
	"tickets.move": core("mutation", tickets.move),
	"tickets.updateMany": core("mutation", tickets.updateMany),
	"tickets.deleteMany": core("mutation", tickets.deleteMany),
	"tickets.delete": core("mutation", tickets.delete),
	"timeline.list": core("read", timeline.list),
	"comments.thread": core("read", comments.thread),
	"comments.resolve": core("mutation", comments.resolve),
	"comments.create": core("mutation", comments.create),
	"comments.update": core("mutation", comments.update),
	"comments.delete": core("mutation", comments.delete),
	"attachments.list": io("read", attachments.list),
	"attachments.upload": io("mutation", attachments.upload),
	"attachments.get": io("read", attachments.get),
	"attachments.delete": io("mutation", attachments.remove),
	"pullRequests.list": io("read", pullRequests.list),
	"pullRequests.link": prepared("mutation", pullRequests.prepareLink, pullRequests.link),
	"pullRequests.unlink": io("mutation", pullRequests.unlink),
	"pullRequests.refresh": prepared("mutation", pullRequests.prepareRefresh, pullRequests.refresh),
	"pullRequests.diff": prepared("read", pullRequests.prepareDiff, pullRequests.diff),
	"search.query": core("search", search.query),
	"inbox.get": core("read", inbox.get),
	"brief.get": core("read", brief.get),
	"actors.list": core("read", actors.list),
	"actors.default": core("read", actors.default),
	"settings.get": core("read", settings.get),
	"settings.set": core("mutation", settings.set),
	"system.health": io("read", system.health),
	"system.gh": io("read", system.gh),
	"system.snapshot": io("mutation", system.snapshot),
	"system.export": { family: "io", kind: "read", stream: system.exportNdjson } as ServiceEntry,
} satisfies Record<string, ServiceEntry>;

export type ServiceName = keyof typeof services;
