import { expect, test } from "bun:test";
import { friendlySessionName, sessionSlug, uniqueSessionName } from "./sessionName.ts";

test("a generated name is an adjective and a noun", () => {
	expect(friendlySessionName(() => 0)).toBe("amber-anchor");
	expect(friendlySessionName(() => 0.999)).toBe("witty-willow");
	expect(friendlySessionName()).toMatch(/^[a-z]+-[a-z]+$/);
});

test("a typed name becomes lowercase letters, digits, and single dashes", () => {
	expect(sessionSlug("Fix the Widget!")).toBe("fix-the-widget");
	expect(sessionSlug("  --Spaced__out--  ")).toBe("spaced-out");
	expect(sessionSlug("Ünïcode café 42")).toBe("n-code-caf-42");
	expect(sessionSlug("!!!")).toBe("");
	expect(sessionSlug(`${"a".repeat(39)}-b`)).toBe("a".repeat(39));
	expect(sessionSlug("a".repeat(50))).toHaveLength(40);
});

test("a taken name gets the first free numeric suffix, inside 40 characters", () => {
	const taken = new Set(["amber-otter", "amber-otter-2"]);
	expect(uniqueSessionName("amber-otter", taken)).toBe("amber-otter-3");
	expect(uniqueSessionName("coral-reef", taken)).toBe("coral-reef");
	const long = "a".repeat(40);
	expect(uniqueSessionName(long, new Set([long]))).toBe(`${"a".repeat(38)}-2`);
});
