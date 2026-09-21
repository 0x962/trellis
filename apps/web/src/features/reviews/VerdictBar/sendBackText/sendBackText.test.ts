import { expect, test } from "bun:test";
import { draftCount, sendBackLabel, sendBackResult } from "./sendBackText";

test("the draft count keeps the singular for one draft", () => {
	expect(draftCount(0)).toBe("0 drafts");
	expect(draftCount(1)).toBe("1 draft");
	expect(draftCount(3)).toBe("3 drafts");
});

test("the button names the agent, and it names a new agent when the ticket has none", () => {
	expect(sendBackLabel("crisp-fjord")).toBe("Send back to crisp-fjord");
	expect(sendBackLabel(null)).toBe("Send back to a new agent");
});

test("the result sentence names the agent that holds the review", () => {
	expect(sendBackResult("crisp-fjord")).toBe("crisp-fjord has the review.");
});
