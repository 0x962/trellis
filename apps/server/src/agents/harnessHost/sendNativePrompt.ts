import { createHash } from "node:crypto";
import type { RuntimeExpectedTurn } from "@trellis/runtime-protocol";
import { requestCodex } from "../harnesses/codex/requestCodex.ts";
import { requestMuse } from "../harnesses/muse/requestMuse.ts";
import { sendOpenCode } from "../harnesses/opencode/interruptOpenCode.ts";
import type { HarnessDescriptor, HarnessHostOptions } from "./types.ts";

export async function sendNativePrompt(
	options: HarnessHostOptions,
	descriptor: HarnessDescriptor,
	sessionId: string,
	messageId: string,
	prompt: string,
	expected?: RuntimeExpectedTurn,
) {
	const id = descriptor.spec.id;
	const reservation = await options.runtime.registerNativeDelivery(
		id,
		descriptor.spec.env!.TRELLIS_ATTEMPT_TOKEN!,
		messageId,
		createHash("sha256").update(prompt).digest("hex"),
		expected,
	);
	if (!reservation.claimed) return reservation;
	try {
		if (descriptor.harness === "codex")
			await requestCodex(
				descriptor.spec.env!.TRELLIS_CODEX_CONTROL_SOCKET!,
				descriptor.spec.env!.TRELLIS_CODEX_CONTROL_TOKEN!,
				"/prompt",
				{ sessionId, prompt },
			);
		else if (descriptor.harness === "muse")
			await requestMuse(
				descriptor.spec.env!.TRELLIS_MUSE_CONTROL_SOCKET!,
				descriptor.spec.env!.TRELLIS_MUSE_CONTROL_TOKEN!,
				"/prompt",
				{ sessionId, prompt },
			);
		else
			await sendOpenCode(
				descriptor.spec.env!.TRELLIS_OPENCODE_CONTROL_SOCKET!,
				descriptor.spec.env!.TRELLIS_OPENCODE_CONTROL_TOKEN!,
				sessionId,
				prompt,
			);
	} catch (error) {
		throw Object.assign(
			new Error(
				`Harness attempt ${id} message ${messageId} native dispatch is unconfirmed: ${(error as Error).message}`,
				{ cause: error },
			),
			{ code: "HARNESS_DELIVERY_UNKNOWN" },
		);
	}
	return reservation;
}
