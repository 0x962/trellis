import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import type { JobsLog } from "../../../../../jobs.ts";

export async function observeWarning(
	log: JobsLog,
	input: { executionId: string; attemptId: string; messageId?: string },
	effect: () => Promise<RuntimeProcessStatus>,
) {
	try {
		return await effect();
	} catch (error) {
		log("Langflow native warning remains unconfirmed", {
			...input,
			error: error instanceof Error ? error.message : String(error),
		});
		return null;
	}
}
