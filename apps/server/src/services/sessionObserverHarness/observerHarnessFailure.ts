import { ObserverHarnessError } from "./types.ts";

export function observerHarnessFailure(error: unknown): ObserverHarnessError {
	if (error instanceof ObserverHarnessError) return error;
	const detail = error instanceof Error ? error.message : String(error);
	if (/context.{0,40}(window|length|limit)|prompt.{0,20}too long|too many.{0,20}tokens/i.test(detail))
		return new ObserverHarnessError(
			"OBSERVER_CONTEXT_CAPACITY",
			"The observer context exceeds Claude capacity. Summarize the context explicitly before another request.",
		);
	return new ObserverHarnessError(
		"OBSERVER_HARNESS_FAILED",
		"The Claude observer could not run. Check its account, saved conversation, and runtime.",
	);
}
