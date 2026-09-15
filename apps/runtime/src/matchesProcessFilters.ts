import type { RuntimeListInput, RuntimeProcessStatus } from "@trellis/runtime-protocol";

export function matchesProcessFilters(session: RuntimeProcessStatus, input: RuntimeListInput): boolean {
	if (input.status !== undefined && session.status !== input.status) return false;
	if (input.activity !== undefined && (session.status !== "running" || session.activity?.state !== input.activity))
		return false;
	const hasError = session.error !== null || (session.exitCode !== null && session.exitCode !== 0);
	return input.hasError === undefined || input.hasError === hasError;
}
