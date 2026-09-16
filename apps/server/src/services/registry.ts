import type { Tx } from "../db/tx.ts";
import * as actors from "./actors.ts";
import * as agentRuns from "./agentRuns/agentRuns.ts";
import * as agentCommunication from "./agentRuns/communication.ts";
import * as agentLifecycle from "./agentRuns/lifecycle.ts";
import { readNativeWork, setNativeWork } from "./agentRuns/nativeControl.ts";
import { prepareResume } from "./agentRuns/resume.ts";
import { stopNativeWork } from "./agentRuns/stopNativeWork.ts";
import * as agentTerminal from "./agentRuns/terminal.ts";
import * as attachments from "./attachments.ts";
import * as brief from "./brief.ts";
import * as comments from "./comments.ts";
import * as controller from "./controller/controller.ts";
import * as controllerDispatch from "./controller/dispatch.ts";
import { cancel as cancelManagerAction } from "./controller/nextActions/cancel.ts";
import { list as listManagerActions } from "./controller/nextActions/list.ts";
import * as controllerPrepare from "./controller/prepare.ts";
import * as controllerWork from "./controller/work.ts";
import { diagnostics } from "./diagnostics.ts";
import { check as evidenceCheck } from "./evidence/check.ts";
import { file as evidenceFile } from "./evidence/file.ts";
import { list as evidenceList } from "./evidence/list.ts";
import { recover as evidenceRecover } from "./evidence/recover.ts";
import { register as evidenceRegister } from "./evidence/register.ts";
import { result as evidenceResult } from "./evidence/result.ts";
import { workspace as evidenceWorkspace } from "./evidence/workspace.ts";
import { decide as decideFlowExecution } from "./flowExecutions/decide.ts";
import { list as listFlowExecutions } from "./flowExecutions/list.ts";
import { prepareFlowCancel } from "./flowExecutions/prepareFlowCancel.ts";
import { prepareFlowReconcile } from "./flowExecutions/prepareFlowReconcile.ts";
import { get as getFlowExecution } from "./flowExecutions/queries.ts";
import { start as startFlowExecution } from "./flowExecutions/start.ts";
import * as flows from "./flows/flows.ts";
import * as flowSave from "./flows/save.ts";
import * as harnessAccounts from "./harnessAccounts/harnessAccounts.ts";
import { prepareQuota } from "./harnessAccounts/quota.ts";
import * as needsYou from "./needsYou/needsYou.ts";
import * as personas from "./personas.ts";
import * as projects from "./projects.ts";
import * as pullRequests from "./pullRequests.ts";
import { prepareResumeRestart } from "./restartAgents/restartAgents.ts";
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
import { list as listSubmanagers } from "./submanagers/list.ts";
import { prepareStart as startSubmanager } from "./submanagers/prepareStart.ts";
import { resize as resizeSubmanager } from "./submanagers/resize.ts";
import { prepareRetire as retireSubmanager } from "./submanagers/retire.ts";
import type { IoCtx, PrepareCtx } from "./support.ts";
import * as system from "./system.ts";
import * as tickets from "./tickets.ts";
import * as timeline from "./timeline.ts";

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

const core = (kind: ServiceKind, run: CoreRun): ServiceEntry => ({ family: "core", kind, run });
const io = (kind: ServiceKind, run: Run): ServiceEntry => ({ family: "io", kind, run });
const prepared = (kind: ServiceKind, prepare: Prepare, run: Run): ServiceEntry => ({
	family: "io",
	kind,
	prepare,
	run,
});
const agentMutation = (prepare: Prepare) =>
	prepared(
		"mutation",
		async (ctx, input) => agentRuns.observeResult(ctx, (await prepare(ctx, input)) as { id: string }),
		agentRuns.finish,
	);

export const services = {
	"submanagers.list": core("read", listSubmanagers),
	"submanagers.start": agentMutation(startSubmanager),
	"submanagers.resize": core("mutation", resizeSubmanager),
	"submanagers.retire": prepared("mutation", retireSubmanager, agentTerminal.result),
	"harnessAccounts.list": io("read", harnessAccounts.list),
	"harnessAccounts.create": prepared("mutation", harnessAccounts.prepareCreate, harnessAccounts.create),
	"harnessAccounts.update": io("mutation", harnessAccounts.update),
	"harnessAccounts.remove": io("mutation", harnessAccounts.remove),
	"harnessAccounts.quota": prepared("read", prepareQuota, agentTerminal.result),
	"flowExecutions.start": core("mutation", startFlowExecution),
	"flowExecutions.get": core("read", getFlowExecution),
	"flowExecutions.list": core("read", listFlowExecutions),
	"flowExecutions.decide": core("mutation", decideFlowExecution),
	"flowExecutions.cancel": prepared("mutation", prepareFlowCancel, agentTerminal.result),
	"flowExecutions.reconcile": prepared("mutation", prepareFlowReconcile, agentTerminal.result),
	"system.doctor": prepared("read", diagnostics, agentTerminal.result),
	"system.nativeWork": core("read", (_ctx, tx) => readNativeWork(tx)),
	"system.resumeNativeWork": core("mutation", (ctx, tx) => setNativeWork(ctx, tx, { paused: false })),
	"system.resumeRestart": prepared("mutation", prepareResumeRestart, agentTerminal.result),
	"system.stopNativeWork": prepared("mutation", stopNativeWork, agentTerminal.result),
	"evidence.workspace": prepared("read", evidenceWorkspace, evidenceResult),
	"evidence.file": prepared("read", evidenceFile, evidenceResult),
	"evidence.list": prepared("read", evidenceList, evidenceResult),
	"evidence.check": prepared("mutation", evidenceCheck, evidenceResult),
	"evidence.register": prepared("mutation", evidenceRegister, evidenceResult),
	"evidence.recover": core("mutation", evidenceRecover),
	"agentRuns.session": prepared("read", agentTerminal.session, agentTerminal.result),
	"agentRuns.terminalTarget": core("read", agentTerminal.streamTarget),
	"agentRuns.terminalOutput": prepared("read", agentTerminal.output, agentTerminal.result),
	"agentRuns.terminalInput": prepared("mutation", agentTerminal.input, agentTerminal.result),
	"agentRuns.interrupt": prepared("mutation", agentTerminal.interrupt, agentTerminal.result),
	"agentRuns.resize": prepared("mutation", agentTerminal.resize, agentTerminal.result),
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

	"agentRuns.send": agentMutation(agentCommunication.prepareSend),
	"controller.collect": prepared("mutation", controllerPrepare.prepare, controllerPrepare.collect),
	"controller.claim": prepared("mutation", controllerPrepare.prepare, controllerPrepare.claim),
	"controller.complete": core("mutation", controller.complete),
	"controller.recover": core("mutation", controller.recover),
	"controller.list": core("read", controller.list),
	"controller.actions": core("read", listManagerActions),
	"controller.cancelAction": core("mutation", cancelManagerAction),
	"controller.handle": core("mutation", controllerWork.handle),
	"controller.retry": core("mutation", controller.retry),
	"controller.resolveUnknown": core("mutation", controller.resolveUnknown),
	"controller.dispatch": prepared("mutation", controllerDispatch.dispatch, controllerDispatch.finished),
	"agentRuns.output": prepared("read", agentCommunication.prepareOutput, agentCommunication.output),
	"agentRuns.list": prepared("read", agentRuns.prepareList, agentTerminal.result),
	"agentRuns.start": agentMutation(agentRuns.prepareStart),
	"agentRuns.resume": agentMutation(prepareResume),
	"agentRuns.stop": agentMutation(agentLifecycle.prepareStop),
	"agentRuns.refresh": agentMutation(agentLifecycle.prepareRefresh),
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
	"needsYou.list": core("read", needsYou.list),
	"needsYou.summary": core("read", needsYou.summary),
	"needsYou.update": core("mutation", needsYou.update),
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
	"brief.get": core("read", brief.get),
	"actors.list": core("read", actors.list),
	"actors.default": core("read", actors.default),
	"settings.get": core("read", settings.get),
	"settings.set": core("mutation", settings.set),
	"system.health": io("read", system.health),
	"system.snapshot": io("mutation", system.snapshot),
	"system.export": { family: "io", kind: "read", stream: system.exportNdjson } as ServiceEntry,
} satisfies Record<string, ServiceEntry>;

export type ServiceName = keyof typeof services;
