import type { HarnessHost } from "../../../agents/harnessHost/harnessHost";
import type { StopStateOperations } from "../stopState";
import { stopAttempt } from "../stopAttempt";
import { withAttemptOperation } from "../withAttemptOperation";

export type StopStateClient = {
	[K in keyof StopStateOperations]: (input: StopStateOperations[K]["input"]) => Promise<StopStateOperations[K]["output"]>;
};

export async function drainPendingStops(input: {
	home: string; executionId: string; state: StopStateClient; host: Pick<HarnessHost, "stop">;
	now(): Date; log(message: string, details: Record<string, unknown>): void;
}) {
	for (const stop of await input.state.stops({ executionId: input.executionId })) {
		if (stop.state === "confirmed") continue;
		await withAttemptOperation(input.home, stop.attemptId, async () => {
			const current = (await input.state.stops({ executionId: input.executionId })).find((value) => value.obligationId === stop.obligationId);
			if (!current) throw new Error("stop_not_found");
			if (current.state === "confirmed") return;
			const observed = await stopAttempt(input.host, current, input.now);
			await input.state.settle({ expectedRevision: current.revision, obligation: observed.obligation });
			if (observed.error !== null) input.log("Langflow native stop remains unconfirmed", {
				executionId: input.executionId, attemptId: current.attemptId, error: observed.error,
			});
		});
	}
	return (await input.state.stops({ executionId: input.executionId })).some((stop) => stop.state !== "confirmed");
}
