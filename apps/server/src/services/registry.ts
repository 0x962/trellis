import type { Tx } from "../db/tx.ts";
import * as actors from "./actors.ts";
import * as agentRuns from "./agentRuns/agentRuns.ts";
import * as agentCommunication from "./agentRuns/communication.ts";
import * as agentLifecycle from "./agentRuns/lifecycle.ts";
import * as agents from "./agents.ts";
import * as attachments from "./attachments.ts";
import * as brief from "./brief.ts";
import * as comments from "./comments.ts";
import * as flows from "./flows/flows.ts";
import * as flowSave from "./flows/save.ts";
import * as inbox from "./inbox.ts";
import * as personas from "./personas.ts";
import * as projects from "./projects.ts";
import * as pullRequests from "./pullRequests.ts";
import * as reviewDelivery from "./reviews/delivery";
import * as reviewImage from "./reviews/image";
import * as reviewMessages from "./reviews/messages";
import * as reviewPrs from "./reviews/prs";
import * as reviewRemote from "./reviews/remote";
import * as reviewRevision from "./reviews/revision";
import * as reviewRuns from "./reviews/runs";
import * as reviewSubmissions from "./reviews/submissions";
import * as reviewThreads from "./reviews/threads";
import * as reviewTransfers from "./reviews/transfers";
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

// The `agents` family gets the core context plus the agents runner; its
// `prepare` step is where the runner works.
export type ServiceKind = "mutation" | "read" | "search";
export type ServiceEntry =
	| { family: "core"; kind: ServiceKind; run: Run }
	| { family: "io"; kind: ServiceKind; run: Run }
	| { family: "io"; kind: ServiceKind; prepare: Prepare; run: Run }
	| { family: "io"; kind: ServiceKind; stream: Stream }
	| { family: "agents"; kind: ServiceKind; prepare: Prepare; run: Run }
	| { family: "agents"; kind: ServiceKind; run: Run };

const core = (kind: ServiceKind, run: Run): ServiceEntry => ({ family: "core", kind, run });
const io = (kind: ServiceKind, run: Run): ServiceEntry => ({ family: "io", kind, run });
const prepared = (kind: ServiceKind, prepare: Prepare, run: Run): ServiceEntry => ({
	family: "io",
	kind,
	prepare,
	run,
});
const runner = (prepare: Prepare, run: Run): ServiceEntry => ({ family: "agents", kind: "mutation", prepare, run });

export const services = {
	"reviews.image": prepared("read", reviewImage.image, reviewRemote.result),
	"reviews.status": prepared("read", reviewRevision.status, reviewRemote.result),
	"reviews.runs": prepared("mutation", reviewRuns.runs, reviewRemote.result),
	"reviews.action": prepared("mutation", reviewRemote.action, reviewRemote.result),
	"reviews.metadata": prepared("read", reviewRemote.metadata, reviewRemote.result),
	"reviews.mine": prepared("read", reviewRemote.mine, reviewRemote.result),
	"reviews.importMargin": io("mutation", reviewTransfers.importMargin),
	"reviews.export": io("read", reviewTransfers.exportReview),
	"reviews.refresh": prepared("mutation", reviewRevision.prepare, reviewRevision.refresh),
	"reviews.revision": io("read", reviewRevision.revision),
	"reviews.file": prepared("read", reviewRevision.prepareFile, reviewRevision.file),
	"reviews.open": io("mutation", reviewPrs.open),
	"reviews.prs": io("read", reviewPrs.prs),
	"reviews.list": io("read", reviewThreads.list),
	"reviews.thread": io("read", reviewThreads.thread),
	"reviews.add": io("mutation", reviewThreads.add),
	"reviews.reply": io("mutation", reviewThreads.reply),
	"reviews.resolve": io("mutation", reviewThreads.resolve),
	"reviews.edit": io("mutation", reviewMessages.edit),
	"reviews.reaction": io("mutation", reviewMessages.reaction),
	"reviews.submit": io("mutation", reviewSubmissions.submit),
	"reviews.show": io("read", reviewSubmissions.show),
	"reviews.history": io("read", reviewSubmissions.history),
	"reviews.inbox": io("read", reviewSubmissions.inbox),
	"reviews.read": io("mutation", reviewSubmissions.read),
	"reviews.resend": io("mutation", reviewDelivery.resend),
	"reviews.deliverPending": prepared("mutation", reviewDelivery.preparePending, reviewDelivery.finished),

	"agentRuns.send": prepared("mutation", agentCommunication.prepareSend, agentRuns.finish),
	"agentRuns.output": prepared("read", agentCommunication.prepareOutput, agentCommunication.output),
	"agentRuns.list": core("read", agentRuns.list),
	"agentRuns.start": prepared("mutation", agentRuns.prepareStart, agentRuns.finish),
	"agentRuns.stop": prepared("mutation", agentLifecycle.prepareStop, agentRuns.finish),
	"agentRuns.refresh": prepared("mutation", agentLifecycle.prepareRefresh, agentRuns.finish),
	"personas.list": core("read", personas.list),
	"personas.create": core("mutation", personas.create),
	"personas.update": core("mutation", personas.update),
	"personas.delete": core("mutation", personas.remove),
	"flows.list": core("read", flows.list),
	"flows.get": core("read", flows.get),
	"flows.create": core("mutation", flows.create),
	"flows.update": core("mutation", flows.update),
	"flows.save": core("mutation", flowSave.save),
	"flows.delete": core("mutation", flows.remove),
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
	"agents.sessions": core("read", agents.sessions),
	"agents.inbox": core("mutation", agents.inbox),
	"agents.register": core("mutation", agents.register),
	"agents.startBuilder": runner(agents.prepareBuilder, agents.startBuilder),
	"agents.startReviewer": runner(agents.prepareReviewer, agents.startReviewer),
	"agents.stop": runner(agents.prepareStop, agents.stop),
	"agents.wake": runner(agents.prepareWake, agents.wake),
	"agents.settings": core("read", agents.settings),
	"agents.setSettings": { family: "agents", kind: "mutation", run: agents.setSettings } as ServiceEntry,
	"agents.runnerProjects": {
		family: "agents",
		kind: "read",
		prepare: agents.prepareRunnerProjects,
		run: agents.runnerProjects,
	} as ServiceEntry,
	"agents.runnerHosts": {
		family: "agents",
		kind: "read",
		prepare: agents.prepareRunnerHosts,
		run: agents.runnerHosts,
	} as ServiceEntry,
	"agents.retryManager": runner(agents.prepareRetry, agents.recordManager),
	"agents.overview": { family: "agents", kind: "read", run: agents.overview } as ServiceEntry,
	// The agents host runs these two. They are not on the API.
	"agents.reconcile": runner(agents.prepareReconcile, agents.reconcile),
	"agents.ensureManager": runner(agents.prepareManager, agents.recordManager),
} satisfies Record<string, ServiceEntry>;

export type ServiceName = keyof typeof services;
