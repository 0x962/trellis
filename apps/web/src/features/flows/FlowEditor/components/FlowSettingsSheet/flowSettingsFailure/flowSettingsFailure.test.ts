import { expect, test } from "bun:test";
import { ORPCError } from "@orpc/client";
import { flowSettingsFailure } from "./flowSettingsFailure";

test("distinguishes metadata conflicts, deletion, and network failure", () => {
	expect(flowSettingsFailure(new ORPCError("FLOW_VERSION_CONFLICT", { data: { version: 7 } }))).toEqual({
		state: "conflict",
		serverVersion: 7,
	});
	expect(flowSettingsFailure(new ORPCError("NOT_FOUND"))).toEqual({ state: "deleted" });
	expect(flowSettingsFailure(new Error("Connection lost"))).toEqual({ state: "failed", message: "Connection lost" });
});
