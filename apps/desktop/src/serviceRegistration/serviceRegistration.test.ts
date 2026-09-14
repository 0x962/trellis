import { expect, test } from "bun:test";
import { serviceNeedsRegistration } from "./serviceRegistration.ts";

test("a fresh bundle with notFound can request explicit service registration", () => {
	expect(serviceNeedsRegistration("notFound")).toBe(true);
	expect(serviceNeedsRegistration("notRegistered")).toBe(true);
	expect(serviceNeedsRegistration("requiresApproval")).toBe(false);
	expect(serviceNeedsRegistration("enabled")).toBe(false);
});
