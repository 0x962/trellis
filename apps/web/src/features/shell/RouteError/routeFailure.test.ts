import { describe, expect, test } from "bun:test";
import { failureRecovered, shownFailure } from "./routeFailure";

describe("shownFailure", () => {
	test("reads a missing route file as a new build while the connection is live", () => {
		expect(shownFailure("chunk", "live")).toBe("chunk");
	});

	test("reads a missing route file as an offline server while the connection is down", () => {
		expect(shownFailure("chunk", "down")).toBe("offline");
		expect(shownFailure("chunk", "reconnecting")).toBe("offline");
	});

	test("leaves every other failure as it is", () => {
		expect(shownFailure("refused", "down")).toBe("refused");
		expect(shownFailure("other", "live")).toBe("other");
		expect(shownFailure("offline", "live")).toBe("offline");
	});
});

describe("failureRecovered", () => {
	test("clears the offline failure when the connection comes back", () => {
		expect(failureRecovered("offline", "live", "down")).toBe(true);
		expect(failureRecovered("offline", "live", "reconnecting")).toBe(true);
	});

	test("clears nothing while the connection stays down", () => {
		expect(failureRecovered("offline", "reconnecting", "down")).toBe(false);
	});

	test("clears nothing on a repeated live status, so the page loads once", () => {
		expect(failureRecovered("offline", "live", "live")).toBe(false);
	});

	test("clears no failure that the connection does not cause", () => {
		expect(failureRecovered("refused", "live", "down")).toBe(false);
		expect(failureRecovered("chunk", "live", "down")).toBe(false);
		expect(failureRecovered("other", "live", "down")).toBe(false);
	});
});
