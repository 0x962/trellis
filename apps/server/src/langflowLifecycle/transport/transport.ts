import type { FlowExecutionViewV1 } from "@trellis/api";
import type { ServiceTransport } from "../../db/transport";
import type { NativeReservationInput } from "../../services/langflowDispatch/prepareNativeReservation";
import { NativeRequestV1Schema, readProtocolBytes } from "../../langflowContracts";
import type { LangflowLifecycle } from "../types";

export function langflowLifecycleTransport(transport: ServiceTransport, lifecycle: LangflowLifecycle): ServiceTransport {
	return {
		start: (jobs) => transport.start(jobs),
		close: () => transport.close(),
		call: async (name, context, input, timing) => {
			const result = await transport.call(name, context, input, timing);
			if (name === "flowExecutionsV1.start" || name === "flowExecutionsV1.decision" || name === "flowExecutionsV1.cancel") {
				const view = result as FlowExecutionViewV1;
				if (view.engine === "langflow")
					lifecycle.committed({
						domain: name === "flowExecutionsV1.start" ? "admission" : name === "flowExecutionsV1.decision" ? "decisions" : "stops",
						executionId: view.id,
					});
			}
			if (name === "langflowNative.reserve") {
				const request = readProtocolBytes(NativeRequestV1Schema, (input as NativeReservationInput).requestBytes);
				lifecycle.committed({ domain: "native", executionId: request.executionId });
			}
			return result;
		},
	};
}
