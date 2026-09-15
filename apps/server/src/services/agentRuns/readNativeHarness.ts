import type { AgentRun } from "@trellis/api";
import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import { nativeClient } from "../../agents/native/connection.ts";
import type { HarnessSnapshot } from "../../agents/nativeHarness/types.ts";
import type { ServiceCtx } from "../support.ts";

export async function readNativeHarness(
	ctx: Pick<ServiceCtx, "home">,
	run: Pick<AgentRun, "runtime" | "terminalId" | "sessionId">,
	client: Pick<RuntimeClient, "inspect"> = nativeClient(ctx.home),
): Promise<HarnessSnapshot | null> {
	if (run.runtime !== "native" || run.terminalId === null) return null;
	const session = await client.inspect(run.terminalId);
	const interrupted = session.agent?.outcome === "interrupted";
	const failed = session.agent?.error != null || session.agent?.outcome === "failed" || interrupted;
	const completed = !failed && session.result !== null && session.activity?.state !== "working";
	const state =
		session.status === "unknown"
			? "unknown"
			: failed
				? "failed"
				: session.status === "exited"
					? completed
						? "idle"
						: "failed"
					: session.controllable
						? (session.activity?.state ?? "unknown")
						: "unknown";
	return {
		state,
		sessionId: session.agent?.sessionId ?? null,
		acknowledgedMessageIds: session.acknowledgedMessageIds,
		result: completed ? session.result!.text : null,
		resultId: completed ? session.result!.id : null,
		error:
			session.agent?.error ??
			(interrupted ? "The agent turn was interrupted." : null) ??
			session.error ??
			(state === "failed" ? "The agent process exited without a completed turn." : null),
	};
}
