import { describe, expect, test } from "bun:test";
import { setupFeedback, setupNameError, setupNameNote } from "./setupFeedback";

const invalidName = "Use letters, numbers, spaces, or punctuation. Do not use a colon.";

describe("setup field messages", () => {
	test("warns about cached tickets before a server replacement", () => {
		expect(setupNameNote(false)).toBe("Trellis uses this name on tickets and messages.");
		expect(setupNameNote(true)).toBe("A new server clears this phone's cached tickets.");
	});

	test("states that an empty name is required before character guidance", () => {
		expect(setupNameError({ name: "", validationError: invalidName, revealEmpty: false })).toBeUndefined();
		expect(setupNameError({ name: "", validationError: invalidName, revealEmpty: true })).toBe(
			"Enter your name. Use letters, numbers, spaces, or punctuation. Do not use a colon.",
		);
		expect(setupNameError({ name: "Dana:agent", validationError: invalidName, revealEmpty: true })).toBe(invalidName);
		expect(setupNameError({ name: "Dana", validationError: undefined, revealEmpty: true })).toBeUndefined();
	});
});

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
