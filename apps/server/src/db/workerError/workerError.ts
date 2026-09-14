export const workerError = (event: Pick<ErrorEvent, "error" | "message">): Error =>
	event.error instanceof Error ? event.error : new Error(event.message);
