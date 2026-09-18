import { z } from "zod";
import type { MspClient } from "./mspClient.ts";
import { uuid7 } from "./uuid7.ts";

const approval = z.looseObject({
	approvalId: z.string(),
	sessionId: z.string(),
	currentRequirementId: z.unknown(),
	availableChoices: z.array(z.looseObject({ choiceId: z.string(), decision: z.string() })),
});
export async function answerMuseRequest(
	request: { method: string; params?: unknown },
	options: {
		client: MspClient;
		observe: (request: { method: string; params?: unknown }) => void;
		fail: (error: unknown) => void;
	},
) {
	if (request.method === "approval/request") {
		const value = approval.parse(request.params);
		const choice =
			value.availableChoices.find((item) => item.decision === "approved" || item.decision === "approvedForSession") ??
			value.availableChoices[0];
		if (choice)
			void options.client
				.request("approval/decide", {
					commandId: uuid7(),
					sessionId: value.sessionId,
					approvalId: value.approvalId,
					requirementId: value.currentRequirementId,
					choiceId: choice.choiceId,
				})
				.catch(options.fail);
		return {};
	}
	if (request.method === "userInput/request") {
		options.observe(request);
		return {};
	}
	return {};
}
