import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { readClaudeStatus } from "../harnesses/claude/readClaudeStatus.ts";
import { interruptOpenCode } from "../harnesses/opencode/interruptOpenCode.ts";
import { providers } from "./providers.ts";
import type { HarnessDescriptor, HarnessHostOptions } from "./types.ts";

export async function interruptHarness(
	options: HarnessHostOptions,
	descriptor: HarnessDescriptor,
	before: RuntimeProcessStatus,
) {
	const provider = providers[descriptor.harness];
	if (before.status !== "running" || !before.controllable || before.activity === null || before.agent === null)
		throw new Error(`Harness attempt ${before.id} has no controllable observed turn`);
	if (before.activity.state === "idle") return before;
	if (descriptor.harness === "opencode") {
		if (before.agent.sessionId === null || before.agent.turnId === null)
			throw new Error(`Harness attempt ${before.id} has no active provider turn identity`);
		await interruptOpenCode(
			descriptor.spec.env!.TRELLIS_OPENCODE_CONTROL_SOCKET!,
			descriptor.spec.env!.TRELLIS_OPENCODE_CONTROL_TOKEN!,
			before.agent.sessionId,
			before.agent.turnId,
		);
		return null;
	}
	const expected = { turnId: before.agent.turnId, activityAt: before.activity.updatedAt };
	await options.runtime.input(before.id, Buffer.from(provider.interrupt!).toString("base64"), false, expected);
	if (descriptor.harness !== "claude") return null;
	if (before.agent.sessionId === null || before.pid === null)
		throw new Error(`Harness attempt ${before.id} has no provider session identity`);
	const native = await readClaudeStatus(
		{ sessionId: before.agent.sessionId, pid: before.pid },
		descriptor.spec.command,
		descriptor.spec.env,
	);
	if (native?.status !== "idle")
		throw new Error(
			`Harness attempt ${before.id} interrupt remains unconfirmed: Claude reports ${native?.status ?? "no matching session"}`,
		);
	const current = await options.runtime.inspect(before.id);
	if (current.activity?.state === "idle" && current.agent?.turnId === before.agent.turnId) return current;
	return options.runtime.observe(
		before.id,
		descriptor.spec.env!.TRELLIS_ATTEMPT_TOKEN!,
		{ kind: "idle", outcome: "interrupted", ...(before.agent.turnId !== null ? { turnId: before.agent.turnId } : {}) },
		expected,
	);
}
