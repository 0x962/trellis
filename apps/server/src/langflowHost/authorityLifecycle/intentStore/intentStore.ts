import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { lockHome } from "../../../homeLock";
import { DeliveryAuthorityV1Schema } from "../../../langflowContracts";
import { authorityPermitBinding } from "../../authorityPermit";
import type { LiveOwnership } from "../../contracts";
import type { EffectBinding } from "../../dispatchGate";
import { type HostControlIdentity, LangflowHostControl } from "../../hostControl";
import { ReceiptObjectStore } from "../../objectStore";

export const AuthorityLeasePolicySchema = z.strictObject({
	durationMs: z.number().int().positive().safe(),
	renewBeforeMs: z.number().int().nonnegative().safe(),
}).refine((value) => value.renewBeforeMs < value.durationMs);
export type AuthorityLeasePolicy = z.infer<typeof AuthorityLeasePolicySchema>;
const intent = z.strictObject({
	executionId: z.string().min(1),
	requestId: z.uuid(),
	expectedRevision: z.number().int().positive().safe(),
	expiresAt: z.iso.datetime(),
});
const PlanSchema = z.strictObject({
	initial: z.boolean(),
	dataHomeId: z.string().min(1),
	priorAuthorityBytes: z.string().min(1),
	targetOwnerId: z.string().min(1),
	revokedAt: z.iso.datetime(),
	intent: z.union([
		intent.extend({ expectedOwnerId: z.string().min(1), expectedEpoch: z.number().int().positive().safe() }),
		intent,
	]),
});
export type AuthorityPlan = z.infer<typeof PlanSchema>;

export class AuthorityIntentStore {
	private readonly directory: string;
	private readonly objects: ReceiptObjectStore;

	constructor(private readonly identity: HostControlIdentity) {
		this.directory = join(LangflowHostControl.directory(identity.home), "authority-intents");
		this.objects = new ReceiptObjectStore(this.directory);
	}

	prepare(priorAuthorityBytes: string, observation: LiveOwnership, policy: AuthorityLeasePolicy, initial = false): AuthorityPlan {
		const prior = DeliveryAuthorityV1Schema.parse(JSON.parse(priorAuthorityBytes));
		if (prior.hostId !== this.identity.hostId || observation.identity.dataHomeId !== this.identity.dataHomeId) {
			throw new Error("authority_intent_home_conflict");
		}
		const key = JSON.stringify([initial ? "initial" : "revision", prior.executionId, prior.ownershipRevision]);
		const lock = lockHome(this.directory, "server", null);
		try {
			const saved = this.objects.findBinding(key);
			if (saved) {
				const plan = this.read(saved);
				if (plan.priorAuthorityBytes !== priorAuthorityBytes || plan.targetOwnerId !== observation.identity.ownerId) {
					throw new Error("authority_intent_owner_changed");
				}
				return plan;
			}
			const plan = PlanSchema.parse({
				initial,
				dataHomeId: this.identity.dataHomeId,
				priorAuthorityBytes,
				targetOwnerId: observation.identity.ownerId,
				revokedAt: observation.observedAt,
				intent: {
					executionId: prior.executionId,
					requestId: crypto.randomUUID(),
					expectedRevision: prior.ownershipRevision,
					expiresAt: new Date(Date.parse(observation.observedAt) + policy.durationMs).toISOString(),
					...(prior.ownerId === observation.identity.ownerId
						? {}
						: { expectedOwnerId: prior.ownerId, expectedEpoch: prior.engineEpoch }),
				},
			});
			const id = this.objects.write(JSON.stringify(plan));
			this.objects.bind(JSON.stringify(["request", plan.intent.requestId]), id);
			this.objects.bind(key, id);
			return plan;
		} finally {
			lock.release();
		}
	}

	recover(binding: EffectBinding) {
		const plan = this.read(this.objects.readBinding(JSON.stringify(["request", binding.requestId])));
		const authority = DeliveryAuthorityV1Schema.parse(JSON.parse(plan.priorAuthorityBytes));
		const expected = authorityPermitBinding(plan.intent, authority.engineJobId);
		if (!isDeepStrictEqual(expected, binding)) throw new Error("authority_intent_binding_conflict");
		return plan;
	}

	private read(id: string) {
		const plan = PlanSchema.parse(JSON.parse(this.objects.read(id)));
		if (plan.dataHomeId !== this.identity.dataHomeId) throw new Error("authority_intent_home_conflict");
		return plan;
	}
}
