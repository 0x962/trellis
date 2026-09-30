import * as agentTerminal from "../../agentRuns/terminal.ts";
import * as flowDocuments from "../../flowDocuments";
import { decide as decideFlowExecution } from "../../flowExecutions/decide.ts";
import { list as listFlowExecutions } from "../../flowExecutions/list.ts";
import { prepareFlowCancel } from "../../flowExecutions/prepareFlowCancel.ts";
import { prepareFlowReconcile } from "../../flowExecutions/prepareFlowReconcile.ts";
import { get as getFlowExecution } from "../../flowExecutions/queries.ts";
import * as flows from "../../flows/flows.ts";
import { recoverPairedRuntimeFinalization } from "../../langflowBackup";
import { decisionState } from "../../langflowDecisions";
import * as langflowDispatch from "../../langflowDispatch";
import * as editorSessions from "../../langflowEditorSessions";
import { runtimeAcknowledge, runtimeState } from "../../langflowNative/runtime";
import { applyEngineObservation, projectionRecovery, projectionState } from "../../langflowProjection";
import { startState } from "../../langflowStart";
import { stopState } from "../../langflowStops";
import { core, io, prepared, type ServiceEntry } from "../../registryEntry";
import { authorityExecutions } from "../authorityExecutions";
import { documentAction } from "../documentAction";
import { nativeReservationState } from "../nativeReservationState";
import { nativeRuntimeWorker } from "../nativeRuntimeWorker";
import { prepareNativeReservation } from "../prepareNativeReservation";
import { reserveObservedGroupDeadline } from "../reserveGroupDeadline";

export const flowServices = {
	"langflowBackup.recoverRuntimeFinalization": prepared(
		"mutation",
		recoverPairedRuntimeFinalization,
		agentTerminal.result,
	),
	"flowDocuments.actionReceipt": core("read", flowDocuments.readDocumentActionReceipt),
	"flowDocuments.action": prepared("mutation", documentAction, agentTerminal.result),
	"langflowClocks.reserveGroupDeadline": io("mutation", reserveObservedGroupDeadline),
	"langflowHost.executions": io("read", authorityExecutions),
	"langflowStart.state": core("mutation", startState),
	"langflowDecisions.state": core("mutation", decisionState),
	"langflowStops.state": core("mutation", stopState),
	"langflowNative.runtimeState": core("read", runtimeState),
	"langflowNative.runtimeAcknowledge": core("mutation", runtimeAcknowledge),
	"langflowNative.runtimeObserve": prepared("mutation", nativeRuntimeWorker.observe, agentTerminal.result),
	"langflowNative.runtimeRecover": prepared("mutation", nativeRuntimeWorker.recover, agentTerminal.result),
	"langflowProjection.state": core("read", projectionState),
	"langflowProjection.apply": core("mutation", applyEngineObservation),
	"langflowProjection.recovery": core("read", projectionRecovery),
	"langflowNative.reservationState": io("read", nativeReservationState),
	"langflowNative.reserve": prepared("mutation", prepareNativeReservation, agentTerminal.result),
	"langflowHost.authority": prepared("mutation", langflowDispatch.hostAuthority, agentTerminal.result),
	"langflowEditor.readDocument": core("read", editorSessions.readDocument),
	"langflowEditor.saveDocument": core("mutation", editorSessions.saveDocument),
	"langflowEditor.readSaveReceipt": core("read", editorSessions.readSaveReceipt),
	"flowExecutions.start": core("mutation", langflowDispatch.startLegacy),
	"flowDocuments.discovery": io("read", langflowDispatch.discovery),
	"flowDocuments.get": core("read", flowDocuments.get),
	"flowDocuments.save": core("mutation", langflowDispatch.saveDocument),
	"flowDocuments.view": core("read", langflowDispatch.getView),
	"flowDocuments.list": core("read", langflowDispatch.list),
	"flowExecutionsV1.output": core("read", langflowDispatch.output),
	"flowExecutionsV1.recovery": io("read", langflowDispatch.recovery),
	"flowExecutionsV1.start": prepared(
		"mutation",
		(ctx, input) => langflowDispatch.prepareAction(ctx, { operation: "start", input }),
		agentTerminal.result,
	),
	"flowExecutionsV1.decision": prepared(
		"mutation",
		(ctx, input) => langflowDispatch.prepareAction(ctx, { operation: "decision", input }),
		agentTerminal.result,
	),
	"flowExecutionsV1.cancel": prepared(
		"mutation",
		(ctx, input) => langflowDispatch.prepareAction(ctx, { operation: "cancel", input }),
		agentTerminal.result,
	),
	"flowExecutions.get": core("read", getFlowExecution),
	"flowExecutions.list": core("read", listFlowExecutions),
	"flowExecutions.decide": core("mutation", decideFlowExecution),
	"flowExecutions.cancel": prepared("mutation", prepareFlowCancel, agentTerminal.result),
	"flowExecutions.reconcile": prepared("mutation", prepareFlowReconcile, agentTerminal.result),
	"flows.list": core("read", flows.list),
	"flows.get": core("read", flowDocuments.legacyServices.get),
	"flows.create": core("mutation", flows.create),
	"flows.update": core("mutation", flowDocuments.legacyServices.update),
	"flows.save": core("mutation", flowDocuments.legacyServices.save),
	"flows.delete": core("mutation", flows.remove),
} satisfies Record<string, ServiceEntry>;
