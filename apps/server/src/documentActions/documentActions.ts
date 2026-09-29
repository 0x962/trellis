import { join } from "node:path";
import { ORPCError } from "@orpc/server";
import type { FlowDocumentActionResultV1 } from "@trellis/api";
import type { CandidatePackage } from "../../../../integrations/langflow/release";
import type { RequestContext } from "../context";
import type { ServiceTransport } from "../db/transport";
import type { LangflowSupervisor } from "../langflowHost";
import type { DbTiming } from "../serverTiming";
import type { DocumentActionReceipt, DocumentActionReceiptInput } from "../services/flowDocuments";
import type { DocumentActionInput } from "../services/langflowDispatch/documentAction";

export type DocumentActionRuntime = {
	package: CandidatePackage;
	engineCommit: string;
	supervisor: Pick<LangflowSupervisor, "withHealthyEngine">;
};

export function documentActions(options: {
	home: string;
	transport: ServiceTransport;
	runtime?: DocumentActionRuntime;
}) {
	const active = new Set<Promise<FlowDocumentActionResultV1>>();
	let stopped = false;
	const execute = async (request: DocumentActionReceiptInput, context: RequestContext, timing?: DbTiming) => {
		const receipt = (await options.transport.call(
			"flowDocuments.actionReceipt",
			context,
			request,
			timing,
		)) as DocumentActionReceipt;
		if (receipt.state === "completed") return { requestId: receipt.requestId, document: receipt.document };
		const runtime = options.runtime;
		if (runtime === undefined) throw new ORPCError("FLOW_RUNTIME_UNAVAILABLE", { status: 503, defined: true });
		return runtime.supervisor.withHealthyEngine((observation) => {
			const input: DocumentActionInput = {
				...request,
				package: runtime.package,
				engineCommit: runtime.engineCommit,
				observation,
				authenticationFile: join(options.home, "langflow", "secrets", `${observation.identity.instanceId}.token`),
			};
			return options.transport.call("flowDocuments.action", context, input, timing) as Promise<FlowDocumentActionResultV1>;
		});
	};
	return {
		run(request: DocumentActionReceiptInput, context: RequestContext, timing?: DbTiming) {
			if (stopped) return Promise.reject(new Error("langflow_runtime_stopping"));
			const work = execute(request, context, timing);
			active.add(work);
			void work.finally(() => active.delete(work)).catch(() => undefined);
			return work;
		},
		async stop() {
			stopped = true;
			await Promise.allSettled([...active]);
		},
	};
}
