import { describe, expect, test } from "bun:test";
import { setupFeedback } from "./setupFeedback";

describe("setupFeedback", () => {
	test("announces connection progress", () => {
		expect(setupFeedback({ busy: true, invalidPairLink: false, answer: undefined })).toEqual({
			tone: "neutral",
			message: "Testing the connection…",
		});
	});

	test("explains an invalid pair code", () => {
		expect(setupFeedback({ busy: false, invalidPairLink: true, answer: undefined })).toEqual({
			tone: "danger",
			message:
				"This code does not contain a Trellis pair link. Scan the code from Trellis settings, or enter the address.",
		});
	});

	test("gives a recovery action for each connection failure", () => {
		expect(setupFeedback({ busy: false, invalidPairLink: false, answer: { ok: false, kind: "timeout" } })).toEqual({
			tone: "danger",
			message: "The server did not reply in 3 seconds. Check that Trellis is open, then test again.",
		});
		expect(
			setupFeedback({
				busy: false,
				invalidPairLink: false,
				answer: { ok: false, kind: "unreachable", detail: "socket closed" },
			}),
		).toEqual({
			tone: "danger",
			message: "Unable to reach this server. Check the address and network, then test again.",
		});
		expect(setupFeedback({ busy: false, invalidPairLink: false, answer: { ok: false, kind: "not-trellis" } })).toEqual({
			tone: "danger",
			message: "This address does not respond as a Trellis server. Check the address, then test again.",
		});
	});

	test("confirms a Trellis server", () => {
		expect(
			setupFeedback({
				busy: false,
				invalidPairLink: false,
				answer: {
					ok: true,
					version: "1.2.3",
					apiVersion: "4",
					ticketCount: 27,
					actorName: "Navid",
				},
			}),
		).toEqual({ tone: "success", message: "Connected to this Trellis server." });
	});
});
