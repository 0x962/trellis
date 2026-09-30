import type { TrellisClient } from "@trellis/api/client";
import { usageError } from "../../errors.ts";
import { currentHead, type PullRequestRef } from "../pullRequestRef.ts";

export const requestReview = async (client: TrellisClient, ref: PullRequestRef, reason?: string) => {
	if (reason !== undefined) {
		if (reason.trim() === "") throw usageError("--flow-does-not-apply requires a reason");
		const head = await currentHead(client, ref);
		await client.pullRequests.writeFlowWaiver({ id: ref.id, headSha: head.sha, reason: reason.trim() });
	}
	return client.pullRequests.setLocalState({ id: ref.id, localState: "ready" });
};
