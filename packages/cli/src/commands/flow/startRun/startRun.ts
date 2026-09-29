import { ORPCError } from "@orpc/client";
import { type FlowExecutionStartInput, FlowUnsupportedFormatV1Schema } from "@trellis/api";
import type { TrellisClient } from "@trellis/api/client";
import { CliFailure } from "../../../errors.ts";
import { readV1 } from "../readV1/readV1.ts";
import type { FlowRun } from "../runProgress/runProgress.ts";

export const startRun = async (
	client: TrellisClient,
	input: FlowExecutionStartInput,
	versioned: boolean,
): Promise<FlowRun> => {
	if (!versioned) return client.flowExecutions.start(input);
	let response: unknown;
	try {
		response = await client.flowExecutionsV1.start(input);
	} catch (error) {
		if (!(error instanceof ORPCError)) throw error;
		if (error.code === "FLOW_RUNTIME_UNAVAILABLE") throw new CliFailure(error.code, 6, error.message);
		if (error.code === "FLOW_RECOVERY_BLOCKED") throw new CliFailure(error.code, 4, error.message);
		if (error.code === "FLOW_UNSUPPORTED_FORMAT") {
			const details = FlowUnsupportedFormatV1Schema.parse(error.data);
			throw new CliFailure(
				error.code,
				4,
				`${error.message} Read ${details.supportedEndpoint}. ${details.diagnostics.map((item) => item.message).join("; ")}`,
			);
		}
		throw error;
	}
	const view = readV1.execution(response);
	return view.engine === "legacy" ? client.flowExecutions.get({ id: view.id }) : view;
};
