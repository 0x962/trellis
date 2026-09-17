import { expect, mock, test } from "bun:test";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { interruptHarness } from "../../../../../src/agents/harnessHost/interruptHarness.ts";
import { providers } from "../../../../../src/agents/harnessHost/providers.ts";
import type { HarnessDescriptor, HarnessHostOptions } from "../../../../../src/agents/harnessHost/types.ts";

test.each(["claude", "pi"] as const)("a %s message interrupt does not require turn observations", async (harness) => {
	const input = mock(async (_id: string, _data: string, _submit: boolean) => {});
	const options = { runtime: { input } } as unknown as HarnessHostOptions;
	const descriptor = { harness } as HarnessDescriptor;
	const before = {
		id: "attempt",
		status: "running",
		controllable: true,
		activity: null,
		agent: null,
	} as RuntimeProcessStatus;
	await interruptHarness(options, descriptor, before, false);
	expect(input.mock.calls).toEqual([["attempt", Buffer.from(providers[harness].interrupt).toString("base64"), false]]);
});
