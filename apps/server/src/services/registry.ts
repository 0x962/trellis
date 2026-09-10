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

// The services come in two families with two context shapes. A `core`
// service reads the request context plus the project cache. An `io` service
// reads the data home, the gh runner, and the process facts, and it may
// queue work for after the commit. The transport builds the context of the
// family the entry names and calls `run` inside one transaction.
// biome-ignore lint/suspicious/noExplicitAny: each family has its own ctx type; the transport builds the right one.
type Run = (ctx: any, tx: Tx, input: any) => Promise<unknown>;
// biome-ignore lint/suspicious/noExplicitAny: same as Run, for a service that yields lines.
type Stream = (ctx: any, tx: Tx, input: any) => AsyncGenerator<string>;

export type ServiceEntry = { family: "core"; run: Run } | { family: "io"; run: Run } | { family: "io"; stream: Stream };

const core = (run: Run): ServiceEntry => ({ family: "core", run });
const io = (run: Run): ServiceEntry => ({ family: "io", run });

export const services = {
	"projects.list": core(projects.list),
	"projects.get": core(projects.get),
	"projects.create": core(projects.create),
	"projects.update": core(projects.update),
	"projects.move": core(projects.move),
	"projects.delete": core(projects.delete),
	"projects.setRepos": core(projects.setRepos),
	"statuses.list": core(statuses.list),
	"statuses.create": core(statuses.create),
	"statuses.update": core(statuses.update),
	"statuses.reorder": core(statuses.reorder),
	"statuses.delete": core(statuses.delete),
	"statuses.clear": core(statuses.clear),
	"tickets.list": core(tickets.list),
	"tickets.counts": core(tickets.counts),
	"tickets.board": core(tickets.board),
	"tickets.get": core(tickets.get),
	"tickets.create": core(tickets.create),
	"tickets.update": core(tickets.update),
	"tickets.move": core(tickets.move),
	"tickets.updateMany": core(tickets.updateMany),
	"tickets.deleteMany": core(tickets.deleteMany),
	"tickets.delete": core(tickets.delete),
	"timeline.list": core(timeline.list),
	"comments.create": core(comments.create),
	"comments.update": core(comments.update),
	"comments.delete": core(comments.delete),
	"attachments.list": io(attachments.list),
	"attachments.upload": io(attachments.upload),
	"attachments.get": io(attachments.get),
	"attachments.delete": io(attachments.remove),
	"pullRequests.list": io(pullRequests.list),
	"pullRequests.link": io(pullRequests.link),
	"pullRequests.unlink": io(pullRequests.unlink),
	"pullRequests.refresh": io(pullRequests.refresh),
	"pullRequests.diff": io(pullRequests.diff),
	"search.query": core(search.query),
	"inbox.get": core(inbox.get),
	"brief.get": core(brief.get),
	"actors.list": core(actors.list),
	"actors.default": core(actors.default),
	"settings.get": core(settings.get),
	"settings.set": core(settings.set),
	"system.health": io(system.health),
	"system.gh": io(system.gh),
	"system.backup": io(system.backup),
	"system.export": { family: "io", stream: system.exportNdjson } as ServiceEntry,
} satisfies Record<string, ServiceEntry>;

export type ServiceName = keyof typeof services;
