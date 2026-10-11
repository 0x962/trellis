// The error the execution host factory throws for a host id that no
// registered host serves.
export class UnknownExecutionHost extends Error {
	readonly code = "EXECUTION_HOST_UNKNOWN";
	constructor(readonly hostId: string) {
		super(`No execution host serves host ${hostId}`);
	}
}
