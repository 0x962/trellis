import { join } from "node:path";
import { systemContext } from "../../context";
import type { ServiceTransport } from "../../db/transport";
import type { JobsLog } from "../../jobs";
import {
	AuthorityLifecycle, createEngineClient, InitialAuthorityIssuer,
	type LangflowSupervisor, type LiveOwnership,
} from "../../langflowHost";
import type { LangflowConnections } from "../../langflowLifecycle";
import { decisionConnection } from "../../services/langflowDecisions";
import { actionControl } from "../../services/langflowDispatch/actionControl";
import type { authorityExecutions } from "../../services/langflowDispatch/authorityExecutions";
import { createNativeRuntimeConnection, nativeRuntimeTransport } from "../../services/langflowNative/runtime";
import {
	createProjectionDomain, type applyEngineObservation, type projectionRecovery, type projectionState,
} from "../../services/langflowProjection";
import { createStartConnection, type StartStateCall } from "../../services/langflowStart";
import { createStopConnection, type StopStateCall } from "../../services/langflowStops";
import { authorityTransport } from "../authorityTransport";
import type { LangflowBootstrapConfiguration } from "../configuration";

export async function createLangflowConnections(input: {
	home: string;
	configured: LangflowBootstrapConfiguration;
	transport: ServiceTransport;
	supervisor: LangflowSupervisor;
	live: LiveOwnership;
	signal: AbortSignal;
	log: JobsLog;
}): Promise<LangflowConnections> {
	const { transport, supervisor, signal, log } = input;
	const control = actionControl(input.home);
	const { identity, gate, archive } = control;
	const authority = authorityTransport(transport, identity);
	const issuer = new InitialAuthorityIssuer(control, supervisor, archive);
	const authorityLifecycle = new AuthorityLifecycle({
		control, archive, supervisor, authority,
		policy: input.configured.authorityPolicy,
		initial: { issuer, store: authority },
		list: (page) => transport.call("langflowHost.executions", systemContext(), {
			...page, hostId: identity.hostId, limit: 100,
		}) as ReturnType<typeof authorityExecutions>,
	});
	const authenticationFile = (observation: LiveOwnership) =>
		join(input.home, "langflow", "secrets", `${observation.identity.instanceId}.token`);
	const projection = createProjectionDomain({
		hostId: identity.hostId, signal,
		engine: {
			request: (request) => supervisor.withHealthyEngine((observation) =>
				createEngineClient({ endpoint: observation.endpoint, authenticationFile: authenticationFile(observation) }).request(request)),
		},
		readAuthorityBytes: (value) => archive.readAuthorityBytes(value),
		state: (value) => transport.call("langflowProjection.state", systemContext(), value) as ReturnType<typeof projectionState>,
		apply: (value) => transport.call("langflowProjection.apply", systemContext(), value) as ReturnType<typeof applyEngineObservation>,
		recovery: (value) => transport.call("langflowProjection.recovery", systemContext(), value) as ReturnType<typeof projectionRecovery>,
	});
	const admission = await createStartConnection({
		control, supervisor, archive, issuer, authorityLifecycle, signal, log,
		now: () => new Date(),
		authorityDurationMs: input.configured.authorityPolicy.durationMs,
		permissions: input.configured.authorityPermissions,
		database: (value) => transport.call("langflowStart.state", systemContext(), value) as ReturnType<StartStateCall>,
	});
	const stops = await createStopConnection({
		control, supervisor, archive, signal, log, now: () => new Date(),
		database: (value) => transport.call("langflowStops.state", systemContext(), value) as ReturnType<StopStateCall>,
	});
	return {
		authority: {
			committed: async (value) => { await authorityLifecycle.committed({ ...value, signal }); },
			recover: async () => { await authorityLifecycle.recover({ signal }); },
		},
		admission,
		stops,
		projection,
		decisions: decisionConnection({
			transport, supervisor, gate, archive, signal, log,
			engineTransport: { authenticationFile: authenticationFile(input.live) },
		}),
		native: createNativeRuntimeConnection({
			database: nativeRuntimeTransport(transport, identity.hostId),
			gate, archive, signal, log,
			refreshExecution: projection.committed,
			withEngine: (value, action) => supervisor.withHealthyEngine((observation) => {
				if (value.ownerId !== observation.identity.ownerId || value.hostId !== observation.identity.hostId ||
					observation.identity.dataHomeId !== identity.dataHomeId)
					throw new Error("native_engine_owner_conflict");
				return action(createEngineClient({
					endpoint: observation.endpoint, authenticationFile: authenticationFile(observation),
				}));
			}),
		}),
	};
}
