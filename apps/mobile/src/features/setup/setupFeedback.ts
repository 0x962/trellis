import type { ProbeResult } from "../../lib/server";

export type SetupFeedback = {
	tone: "neutral" | "danger" | "success";
	message: string;
};

type SetupFeedbackInput = {
	busy: boolean;
	invalidPairLink: boolean;
	answer: ProbeResult | undefined;
};

export function setupFeedback({ busy, invalidPairLink, answer }: SetupFeedbackInput): SetupFeedback | undefined {
	if (invalidPairLink) {
		return {
			tone: "danger",
			message:
				"This code does not contain a Trellis pair link. Scan the code from Trellis settings, or enter the address.",
		};
	}
	if (busy) return { tone: "neutral", message: "Testing the connection…" };
	if (answer === undefined) return undefined;
	if (answer.ok) return { tone: "success", message: "Connected to this Trellis server." };
	if (answer.kind === "timeout") {
		return {
			tone: "danger",
			message: "The server did not reply in 3 seconds. Check that Trellis is open, then test again.",
		};
	}
	if (answer.kind === "unreachable") {
		return {
			tone: "danger",
			message: "Unable to reach this server. Check the address and network, then test again.",
		};
	}
	return {
		tone: "danger",
		message: "This address does not respond as a Trellis server. Check the address, then test again.",
	};
}
