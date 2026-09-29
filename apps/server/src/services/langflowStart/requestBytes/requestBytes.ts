import { type FlowExecutionStartInput, FlowExecutionStartInputSchema } from "@trellis/api";

export function requestBytes(input: FlowExecutionStartInput): string {
	const request = FlowExecutionStartInputSchema.parse(input);
	return JSON.stringify({
		flow: request.flow,
		ticket: request.ticket,
		diffId: request.diffId,
		allowRepeat: request.allowRepeat,
		repeatReason: request.repeatReason,
		headSha: request.headSha,
		requestId: request.requestId,
		expectedVersion: request.expectedVersion,
	});
}
