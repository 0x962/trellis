import { expect, test } from "bun:test";
import { ORPCError } from "@orpc/client";
import { failureKind } from "./failureKind";

test("a missing or wrong host token is a refusal", () => {
	expect(failureKind(new ORPCError("UNAUTHORIZED", { status: 401 }))).toBe("refused");
});

test("an origin the host does not serve is a refusal", () => {
	expect(failureKind(new ORPCError("FORBIDDEN", { status: 403 }))).toBe("refused");
});

test("a refusal under another error stays a refusal", () => {
	const wrapped = new Error("The route did not load.", { cause: new ORPCError("FORBIDDEN", { status: 403 }) });

	expect(failureKind(wrapped)).toBe("refused");
});

test("a server that answers with an error of its own is not a refusal", () => {
	expect(failureKind(new ORPCError("INTERNAL_SERVER_ERROR", { status: 500 }))).toBe("other");
});

test("a port with no listener is offline", () => {
	expect(failureKind(new TypeError("Failed to fetch"))).toBe("offline");
});

test("a route file that a new build renamed is a chunk failure", () => {
	expect(failureKind(new Error("Failed to fetch dynamically imported module: /assets/board.js"))).toBe("chunk");
});
