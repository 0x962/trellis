import { describe, expect, test } from "bun:test";
import { failureKind } from "./failureKind";

describe("features/shell/RouteError/failureKind", () => {
	test("a fetch to a stopped server is offline", () => {
		expect(failureKind(new TypeError("Failed to fetch"))).toBe("offline");
		expect(failureKind(new Error("wrapped", { cause: new TypeError("Load failed") }))).toBe("offline");
	});

	test("a renamed route chunk is a chunk failure", () => {
		expect(failureKind(new TypeError("Failed to fetch dynamically imported module: /assets/all-x.js"))).toBe("chunk");
		expect(failureKind(new TypeError("Importing a module script failed."))).toBe("chunk");
	});

	test("any other failure keeps its own message", () => {
		expect(failureKind(new Error("The project is archived."))).toBe("other");
	});
});
