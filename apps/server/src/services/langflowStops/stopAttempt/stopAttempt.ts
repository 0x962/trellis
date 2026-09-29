import type { RuntimeSession } from "@trellis/runtime-protocol";
import type { HarnessHost } from "../../../agents/harnessHost/harnessHost.ts";
import type { StopObligationV1 } from "../../../langflowContracts";

export async function stopAttempt(
	host: Pick<HarnessHost, "stop">,
	obligation: StopObligationV1,
	now: () => Date = () => new Date(),
): Promise<{ obligation: StopObligationV1; error: string | null }> {
	if (obligation.state === "confirmed") return { obligation, error: null };
	let session: RuntimeSession;
	try {
		session = await host.stop(obligation.attemptId);
	} catch (error) {
		return {
			obligation: { ...obligation, revision: obligation.revision + 1, state: "ownership_unknown", exitReceipt: null },
			error: error instanceof Error ? error.message : String(error),
		};
	}
	if (session.id !== obligation.attemptId || session.status !== "exited" || session.endedAt === null)
		return {
			obligation: { ...obligation, revision: obligation.revision + 1, state: "ownership_unknown", exitReceipt: null },
			error: "The runtime did not confirm exit for the exact attempt.",
		};
	return {
		error: null,
		obligation: {
			...obligation,
			revision: obligation.revision + 1,
			state: "confirmed",
			exitReceipt: {
				attemptId: session.id,
				receiptId: obligation.obligationId,
				exitedAt: session.endedAt,
				confirmedAt: now().toISOString(),
			},
		},
	};
}
