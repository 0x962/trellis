// The error `launch.start` throws when the id of the spec differs from the
// attempt id of the target. The runtime session id is the attempt id, so a
// spec with another id would start a session the target cannot name.
export class LaunchSpecMismatch extends Error {
	readonly code = "EXECUTION_SPEC_MISMATCH";
	constructor(
		readonly attemptId: string,
		readonly specId: string,
	) {
		super(`Launch spec ${specId} does not belong to attempt ${attemptId}`);
	}
}
