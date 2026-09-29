import { expect, test } from "bun:test";
import type { ServiceTransport } from "../../db/transport";
import type { OwnerRevocation } from "../../langflowHost";
import { bootstrapFixture } from "../fixtures";
import { authorityTransport } from "./authorityTransport";

test("internal authority calls retain identity and use the system context", async () => {
	const { identity } = bootstrapFixture();
	const revocation: OwnerRevocation = {
		id: "revocation",
		identity: { ...identity, ownerId: "owner", instanceId: "instance", manifestDigest: "a".repeat(64) },
		observationId: "first-observation",
	};
	const calls: unknown[] = [];
	const transport: ServiceTransport = {
		call: async (name, context, input) => {
			calls.push({ name, actor: context.actor, input });
			return revocation;
		},
		start: async () => ({ applied: 0, liveShas: [] }),
		close: async () => {},
	};
	const request = { dataHomeId: identity.dataHomeId, hostId: identity.hostId, ownerId: "owner" };
	expect(await authorityTransport(transport, identity).readRevocation(request)).toBe(revocation);
	expect(calls).toEqual([{
		name: "langflowHost.authority",
		actor: { kind: "system", name: "trellis" },
		input: { hostId: identity.hostId, dataHomeId: identity.dataHomeId, operation: "readRevocation", input: request },
	}]);
});
