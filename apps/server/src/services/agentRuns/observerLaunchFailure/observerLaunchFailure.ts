export function observerLaunchFailureCode(error: unknown): string {
	const code = error instanceof Error && "code" in error ? error.code : undefined;
	if (
		typeof code === "string" &&
		["HARNESS_NOT_INSTALLED", "ENOENT", "EACCES", "NOT_FOUND", "INVALID_INPUT", "RUNNER_UNAVAILABLE"].includes(code)
	)
		return code;
	if (error instanceof Error && error.name === "AbortError") return "REQUEST_CANCELED";
	return "OBSERVER_LAUNCH_FAILED";
}
