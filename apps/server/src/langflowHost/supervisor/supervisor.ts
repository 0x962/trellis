import { isDeepStrictEqual } from "node:util";
import {
	type LangflowSidecarManifestV1,
	LangflowSidecarManifestV1Schema,
} from "../../../../../integrations/langflow/package-probe/sidecarManifest";
import { type HomeLock, lockHome } from "../../homeLock";
import { protocolDigest } from "../../langflowContracts";
import { ExecutionAuthority, type RenewalInput, type TakeoverInput } from "../authority";
import type { LiveOwnership, SidecarIdentity, SupervisorDependencies } from "../contracts";
import { PrivateState } from "../privateState";
import { authenticateEngine } from "./components/authenticateEngine";

export class LangflowSupervisor {
	private busy = false;
	private closed = false;
	private identity: SidecarIdentity | null = null;
	private readonly authority: ExecutionAuthority;

	private constructor(
		private readonly state: PrivateState,
		private readonly lock: HomeLock,
		private readonly hostId: string,
		private readonly manifest: LangflowSidecarManifestV1,
		private readonly deps: SupervisorDependencies,
	) {
		this.authority = new ExecutionAuthority(deps.authority);
	}

	static async open(input: { home: string; hostId: string; manifest: unknown; dependencies: SupervisorDependencies }) {
		const manifest = LangflowSidecarManifestV1Schema.parse(input.manifest);
		if (
			manifest.target.kind !== "linux-oci" ||
			manifest.qualification !== "verified" ||
			manifest.python.version !== "3.12.12"
		)
			throw new Error("sidecar_package_not_approved");
		const state = await PrivateState.open(input.home);
		const lock = lockHome(state.lockDirectory, "server", null);
		return new LangflowSupervisor(state, lock, input.hostId, manifest, input.dependencies);
	}

	async start() {
		return this.exclusive(async () => {
			if (this.identity) throw new Error("sidecar_already_started");
			const previous = await this.state.read();
			if (previous) {
				await this.retire(previous);
			}
			const identity: SidecarIdentity = {
				dataHomeId: this.manifest.data.dataHomeId,
				hostId: this.hostId,
				ownerId: crypto.randomUUID(),
				instanceId: crypto.randomUUID(),
				manifestDigest: protocolDigest(JSON.stringify(this.manifest)),
			};
			await this.state.reserve(identity);
			this.identity = identity;
			await this.deps.driver.start({
				identity,
				manifest: this.manifest,
				dataDirectory: this.state.dataDirectory,
				authenticationFile: this.state.authenticationFile(identity),
			});
			return this.live();
		});
	}

	async withHealthyEngine<T>(operation: (observation: LiveOwnership) => Promise<T>) {
		return this.exclusive(async () => operation(await this.live()));
	}

	async withAuthenticatedEngine<T>(
		authorization: string | null,
		operation: (observation: LiveOwnership) => Promise<T>,
	) {
		return this.exclusive(async () => {
			if (!this.identity) throw new Error("sidecar_unavailable");
			await authenticateEngine(this.state.authenticationFile(this.identity), authorization);
			return operation(await this.live());
		});
	}

	async renew(input: RenewalInput) {
		return this.withHealthyEngine((observation) => this.authority.renew(observation, input));
	}

	async takeover(input: TakeoverInput) {
		return this.withHealthyEngine((observation) => this.authority.takeover(observation, input));
	}

	async shutdown() {
		if (this.closed) return;
		return this.exclusive(async () => {
			const identity = this.identity ?? (await this.state.read());
			if (identity) await this.retire(identity);
			this.identity = null;
			this.closed = true;
			this.lock.release();
		});
	}

	private async retire(identity: SidecarIdentity) {
		if (identity.dataHomeId !== this.manifest.data.dataHomeId || identity.hostId !== this.hostId) {
			throw new Error("sidecar_home_mismatch");
		}
		const observation = await this.observe(identity);
		const revoked = await this.deps.authority.revokeOwner({ identity, observationId: observation.challenge });
		const retained = await this.deps.authority.readRevocation({
			dataHomeId: identity.dataHomeId,
			hostId: identity.hostId,
			ownerId: identity.ownerId,
		});
		if (!isDeepStrictEqual(revoked.identity, identity) || !isDeepStrictEqual(retained, revoked)) {
			throw new Error("sidecar_revocation_mismatch");
		}
		if (observation.state === "running") {
			await this.deps.driver.stop(identity);
			const stopped = await this.observe(identity);
			if (stopped.state !== "exited" && stopped.state !== "absent") throw new Error("sidecar_stop_unconfirmed");
		}
	}

	private async observe(identity: SidecarIdentity) {
		const challenge = crypto.randomUUID();
		const observation = await this.deps.driver.observe({
			identity,
			challenge,
			authenticationFile: this.state.authenticationFile(identity),
		});
		if (!isDeepStrictEqual(observation.identity, identity) || observation.challenge !== challenge) {
			throw new Error("sidecar_observation_mismatch");
		}
		if (observation.state === "unknown") throw new Error("sidecar_ownership_unknown");
		return observation;
	}

	private async live(): Promise<LiveOwnership> {
		if (!this.identity) throw new Error("sidecar_unavailable");
		const observation = await this.observe(this.identity);
		if (observation.state !== "running" || observation.health !== "healthy" || !observation.endpoint) {
			throw new Error("sidecar_unhealthy");
		}
		const endpoint = new URL(observation.endpoint);
		if (
			endpoint.protocol !== "http:" ||
			endpoint.hostname !== "127.0.0.1" ||
			endpoint.username ||
			endpoint.password ||
			endpoint.pathname !== "/" ||
			endpoint.search ||
			endpoint.hash
		)
			throw new Error("sidecar_endpoint_not_private");
		return {
			id: observation.challenge,
			identity: { ...this.identity },
			observedAt: this.deps.now().toISOString(),
			endpoint: endpoint.origin,
		};
	}

	private async exclusive<T>(operation: () => Promise<T>) {
		if (this.closed) throw new Error("sidecar_supervisor_closed");
		if (this.busy) throw new Error("sidecar_supervisor_busy");
		this.busy = true;
		try {
			return await operation();
		} finally {
			this.busy = false;
		}
	}
}
