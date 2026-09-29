import type { DeliveryAuthorityV1 } from "../../../langflowContracts";
import type { createEngineClient } from "../../../langflowHost";
import type { applyEngineObservation } from "../applyEngineObservation";
import type { projectionRecovery } from "../projectionRecovery";
import type { projectionState } from "../projectionState";

export type ProjectionDomainOptions = {
	hostId: string;
	engine: Pick<ReturnType<typeof createEngineClient>, "request">;
	signal: AbortSignal;
	readAuthorityBytes(authority: DeliveryAuthorityV1): string;
	state(input: Parameters<typeof projectionState>[2]): ReturnType<typeof projectionState>;
	apply(input: Parameters<typeof applyEngineObservation>[2]): ReturnType<typeof applyEngineObservation>;
	recovery(input: Parameters<typeof projectionRecovery>[2]): ReturnType<typeof projectionRecovery>;
};

export function createProjectionDomain(options: ProjectionDomainOptions) {
	async function committed(input: { executionId: string }): Promise<void> {
		while (!options.signal.aborted) {
			const prepared = await options.state(input);
			if (prepared === null) return;
			const authorityBytes = options.readAuthorityBytes(prepared.authority);
			const response = await options.engine.request({
				method: "POST",
				path: "/trellis-v1/projection/read",
				body: JSON.stringify({
					executionId: prepared.executionId,
					publicationId: prepared.publicationId,
					engineJobId: prepared.engineJobId,
					authorityBytes,
					after: prepared.after,
				}),
				capabilityId: prepared.authority.capabilityId,
				signal: options.signal,
			});
			if (response.state === "unknown") return;
			if (response.status !== 200) throw new Error(`projection_read_http_${response.status}`);
			const result = await options.apply({
				prepared,
				authorityBytes,
				responseBytes: new TextDecoder("utf-8", { fatal: true }).decode(response.bytes),
			});
			if (result.state !== "advanced") return;
		}
	}

	async function recover(): Promise<void> {
		let afterExecutionId: string | null = null;
		do {
			if (options.signal.aborted) return;
			const page = await options.recovery({ hostId: options.hostId, afterExecutionId, limit: 100 });
			for (const execution of page.items) {
				if (options.signal.aborted) return;
				await committed(execution);
			}
			afterExecutionId = page.nextAfterExecutionId;
		} while (afterExecutionId !== null);
	}

	return { committed, recover };
}
