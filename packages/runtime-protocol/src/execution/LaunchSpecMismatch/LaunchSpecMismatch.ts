// The error a host throws when the id of a launch input differs from the
// attempt id of the target. The runtime session id is the attempt id, so an
// input with another id would prepare or start a session the target cannot
// name.
export class LaunchSpecMismatch extends Error {
	readonly code = "EXECUTION_SPEC_MISMATCH";
	constructor(
		readonly attemptId: string,
		readonly inputId: string,
	) {
		super(`Launch ${inputId} does not belong to attempt ${attemptId}`);
	}
}
