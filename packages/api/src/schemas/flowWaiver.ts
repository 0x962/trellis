import { z } from "zod";
import { ActorRefSchema } from "./actor.ts";
import { IsoDateTimeSchema, UlidSchema } from "./primitives.ts";

const HeadShaSchema = z.string().min(1).max(64);

// What an agent wrote when it said that no flow fits its change. `reason` is
// the sentence a person reads beside the pull request. It answers the flow
// check from then on. `headSha` names the commit the agent looked at when it
// wrote the sentence.
export const PullRequestFlowWaiverSchema = z.object({
	pullRequestId: UlidSchema,
	headSha: HeadShaSchema,
	reason: z.string().min(1),
	actor: ActorRefSchema,
	createdAt: IsoDateTimeSchema,
	updatedAt: IsoDateTimeSchema,
});
export type PullRequestFlowWaiver = z.infer<typeof PullRequestFlowWaiverSchema>;

export const PullRequestFlowWaiverWriteInputSchema = z.strictObject({
	id: UlidSchema,
	headSha: HeadShaSchema,
	reason: z.string().trim().min(1, "Write why no flow fits this change.").max(2000),
});
