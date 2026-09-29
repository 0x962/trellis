import * as agentTerminal from "../../agentRuns/terminal.ts";
import * as flowDocuments from "../../flowDocuments";
import { decide as decideFlowExecution } from "../../flowExecutions/decide.ts";
import { list as listFlowExecutions } from "../../flowExecutions/list.ts";
import { prepareFlowCancel } from "../../flowExecutions/prepareFlowCancel.ts";
import { prepareFlowReconcile } from "../../flowExecutions/prepareFlowReconcile.ts";
import { get as getFlowExecution } from "../../flowExecutions/queries.ts";
import * as flows from "../../flows/flows.ts";
import * as langflowDispatch from "../../langflowDispatch";
import * as editorSessions from "../../langflowEditorSessions";
import { core, io, prepared, type ServiceEntry } from "../../registryEntry";

export const flowServices = {
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
