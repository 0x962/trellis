import type { Tx } from "../db/tx.ts";
import * as actors from "./actors.ts";
import { activity as agentActivity } from "./agentRuns/activity.ts";
import * as agentRuns from "./agentRuns/agentRuns.ts";
import { answerQuestion } from "./agentRuns/answerQuestion.ts";
import * as agentAttention from "./agentRuns/attention.ts";
import * as agentCommunication from "./agentRuns/communication.ts";
import * as agentLifecycle from "./agentRuns/lifecycle.ts";
import { prepareResume } from "./agentRuns/resume.ts";
import { prepareSetModel } from "./agentRuns/setModel/setModel.ts";
import { stopNativeWork } from "./agentRuns/stopNativeWork.ts";
import * as agentTerminal from "./agentRuns/terminal.ts";
import { file as workspaceFile } from "./agentRuns/workspace/file.ts";
import { lineStats as workspaceLineStats } from "./agentRuns/workspace/lineStats.ts";
import { summary as workspaceSummary } from "./agentRuns/workspace/summary.ts";
import { workspace } from "./agentRuns/workspace/workspace.ts";
import * as attachments from "./attachments.ts";
import * as brief from "./brief.ts";
import * as commentMentions from "./commentMentions/run.ts";
import * as comments from "./comments.ts";
import { diagnostics } from "./diagnostics.ts";
import * as epics from "./epics/epics.ts";
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
import * as labelGroups from "./labelGroups.ts";
import * as labels from "./labels.ts";
import * as milestones from "./milestones/milestones.ts";
import * as needsYou from "./needsYou/needsYou.ts";
import * as notes from "./notes/notes.ts";
import * as projects from "./projects.ts";
import * as pullRequests from "./pullRequests.ts";
import * as reviewApply from "./reviews/apply";
import * as reviewImage from "./reviews/image";
import * as reviewMessages from "./reviews/messages";
import * as reviewPrs from "./reviews/prs";
import * as reviewQueries from "./reviews/queries";
import * as reviewRemote from "./reviews/remote";
import * as reviewReviewers from "./reviews/reviewers";
import * as reviewRevision from "./reviews/revision";
import * as reviewThreads from "./reviews/threads";
import * as reviewTransfers from "./reviews/transfers";
import * as search from "./search.ts";
import { prepareCreate as createSession } from "./sessions/create.ts";
import { prepareDelete as deleteSession } from "./sessions/remove.ts";
import * as sessions from "./sessions/sessions.ts";
import { prepareStart as startSession } from "./sessions/start.ts";
import * as settings from "./settings.ts";
import * as statuses from "./statuses.ts";
import type { IoCtx, PrepareCtx } from "./support.ts";
import { prepareSweep } from "./sweep/prepareSweep.ts";
import * as system from "./system.ts";
import { prepareSystemUsage } from "./systemUsage";
import * as tickets from "./tickets.ts";
import * as timeline from "./timeline.ts";
import { prepareAccounts as prepareUsageAccounts } from "./usage/accounts.ts";
import { prepareReport as prepareUsageReport } from "./usage/usage.ts";

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

const sessionMutation = (prepare: Prepare) =>
	prepared(
		"mutation",
		async (ctx, input) => sessions.observe(ctx, (await prepare(ctx, input)) as { id: string }),
		sessions.finish,
	);

export const services = {
	"agentRuns.activity": prepared("read", agentActivity, agentTerminal.result),
	"agentRuns.seen": prepared("mutation", agentAttention.prepareSeen, agentAttention.seen),
	"agentRuns.answer": prepared("mutation", answerQuestion, agentTerminal.result),
	"sessions.activity": prepared("read", sessions.activity, agentTerminal.result),
	"sessions.list": core("read", sessions.list),
	"sessions.get": prepared("read", sessions.observe, agentTerminal.result),
	"sessions.create": prepared(
		"mutation",
		async (ctx, input) => sessions.accepted(ctx, await createSession(ctx, input)),
		sessions.finish,
	),
	"sessions.start": sessionMutation(startSession),
	"sessions.delete": prepared("mutation", deleteSession, agentTerminal.result),
	"harnessAccounts.list": io("read", harnessAccounts.list),
	"harnessAccounts.create": prepared("mutation", harnessAccounts.prepareCreate, harnessAccounts.create),
	"harnessAccounts.update": io("mutation", harnessAccounts.update),
	"harnessAccounts.remove": io("mutation", harnessAccounts.remove),
	"harnessAccounts.quota": prepared("read", prepareQuota, agentTerminal.result),
	"usage.report": prepared("read", prepareUsageReport, agentTerminal.result),
	"usage.accounts": prepared("read", prepareUsageAccounts, agentTerminal.result),
	"flowExecutions.start": core("mutation", startFlowExecution),
	"flowExecutions.get": core("read", getFlowExecution),
	"flowExecutions.list": core("read", listFlowExecutions),
	"flowExecutions.decide": core("mutation", decideFlowExecution),
	"flowExecutions.cancel": prepared("mutation", prepareFlowCancel, agentTerminal.result),
	"flowExecutions.reconcile": prepared("mutation", prepareFlowReconcile, agentTerminal.result),
	"system.doctor": prepared("read", diagnostics, agentTerminal.result),
	"system.stopNativeWork": prepared("mutation", stopNativeWork, agentTerminal.result),
	"system.sweep": prepared("mutation", prepareSweep, agentTerminal.result),
	"agentRuns.workspaceLineStats": prepared("read", workspaceLineStats, agentTerminal.result),
	"agentRuns.workspaceSummary": prepared("read", workspaceSummary, agentTerminal.result),
	"agentRuns.workspace": prepared("read", workspace, agentTerminal.result),
	"agentRuns.file": prepared("read", workspaceFile, agentTerminal.result),
	"agentRuns.session": prepared("read", agentTerminal.session, agentTerminal.result),
	"agentRuns.terminalTarget": core("read", agentTerminal.streamTarget),
	"agentRuns.terminalOutput": prepared("read", agentTerminal.output, agentTerminal.result),
	"agentRuns.terminalInput": prepared("mutation", agentTerminal.input, agentTerminal.result),
	"agentRuns.interrupt": prepared("mutation", agentTerminal.interrupt, agentTerminal.result),
	"agentRuns.resize": prepared("mutation", agentTerminal.resize, agentTerminal.result),
	"reviews.image": prepared("read", reviewImage.image, reviewRemote.result),
	"reviews.status": prepared(
		"read",
		async (ctx, input) => ({ pr: input.pr, remote: await reviewRevision.status(ctx, input) }),
		reviewQueries.status,
	),
	"reviews.reviewers": prepared("read", reviewReviewers.reviewers, reviewReviewers.result),
	"reviews.reviewer": prepared("mutation", reviewReviewers.reviewer, reviewReviewers.result),
	"reviews.action": prepared("mutation", reviewRemote.action, reviewRemote.actionResult),
	"reviews.metadata": prepared("read", reviewRemote.metadata, reviewRemote.result),
	"reviews.mine": prepared("read", reviewRemote.mine, reviewRemote.result),
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
	"reviews.submit": prepared("mutation", reviewRemote.submit, reviewRemote.actionResult),
	"reviews.apply": prepared("mutation", reviewApply.prepareApply, reviewApply.applyResult),

	"agentRuns.send": agentMutation(agentCommunication.prepareSend),
	"commentMentions.dispatch": prepared("mutation", commentMentions.prepare, commentMentions.finish),
	"agentRuns.output": prepared("read", agentCommunication.prepareOutput, agentCommunication.output),
	"agentRuns.list": prepared("read", agentRuns.prepareList, agentTerminal.result),
	"agentRuns.ticketMetrics": prepared("read", agentRuns.prepareTicketMetrics, agentTerminal.result),
	"agentRuns.start": prepared(
		"mutation",
		async (ctx, input) => agentRuns.acceptedResult(ctx, await agentRuns.prepareStart(ctx, input)),
		agentRuns.finish,
	),
	"agentRuns.resume": agentMutation(prepareResume),
	"agentRuns.setModel": agentMutation(prepareSetModel),
	"agentRuns.stop": agentMutation(agentLifecycle.prepareStop),
	"agentRuns.refresh": agentMutation(agentLifecycle.prepareRefresh),
	"flows.list": core("read", flows.list),
	"flows.get": core("read", flows.get),
	"flows.create": core("mutation", flows.create),
	"flows.update": core("mutation", flows.update),
	"flows.save": core("mutation", flowSave.save),
	"flows.delete": core("mutation", flows.remove),
	"labels.list": core("read", labels.list),
	"labels.create": core("mutation", labels.create),
	"labels.update": core("mutation", labels.update),
	"labels.delete": core("mutation", labels.delete),
	"labelGroups.create": core("mutation", labelGroups.create),
	"labelGroups.update": core("mutation", labelGroups.update),
	"labelGroups.delete": core("mutation", labelGroups.delete),
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
	"tickets.importDependencies": core("mutation", tickets.importDependencies),
	"tickets.updateDependencies": core("mutation", tickets.updateDependencies),
	"timeline.list": core("read", timeline.list),
	"needsYou.list": core("read", needsYou.list),
	"needsYou.summary": core("read", needsYou.summary),
	"needsYou.update": core("mutation", needsYou.update),
	"comments.thread": core("read", comments.thread),
	"comments.resolve": core("mutation", comments.resolve),
	"comments.create": core("mutation", comments.create),
	"comments.update": core("mutation", comments.update),
	"comments.delete": core("mutation", comments.delete),
	"notes.list": core("read", notes.list),
	"notes.get": core("read", notes.get),
	"notes.create": core("mutation", notes.create),
	"notes.update": core("mutation", notes.update),
	"notes.delete": core("mutation", notes.remove),
	"epics.list": core("read", epics.list),
	"epics.get": core("read", epics.get),
	"epics.create": core("mutation", epics.create),
	"epics.update": core("mutation", epics.update),
	"epics.delete": core("mutation", epics.remove),
	"milestones.create": core("mutation", milestones.create),
	"milestones.update": core("mutation", milestones.update),
	"milestones.reorder": core("mutation", milestones.reorder),
	"milestones.delete": core("mutation", milestones.remove),
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
	"system.usage": prepared("read", prepareSystemUsage, agentTerminal.result),
	"system.snapshot": io("mutation", system.snapshot),
	"system.export": { family: "io", kind: "read", stream: system.exportNdjson } as ServiceEntry,
} satisfies Record<string, ServiceEntry>;

export type ServiceName = keyof typeof services;
