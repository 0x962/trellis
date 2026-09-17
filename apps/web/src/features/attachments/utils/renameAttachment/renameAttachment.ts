// The two calls a rename makes on the server.
export type RenameSteps = {
	// Uploads the same bytes again under the new name.
	copy: () => Promise<void>;
	// Deletes the attachment that carries the old name.
	removeOriginal: () => Promise<void>;
};

// The step that threw, with the error it threw.
export type RenameFailure = {
	step: "copy" | "removeOriginal";
	error: unknown;
};

// Renames an attachment and reports the step that failed. The server has no
// rename call, so a rename uploads a copy under the new name and deletes the
// original. `copy` runs first: a failed `removeOriginal` leaves the copy and
// the original, and a person deletes the original by hand. In the other
// order, a failed `copy` loses the only file. A rename that works returns
// null.
export const renameAttachment = async (steps: RenameSteps): Promise<RenameFailure | null> => {
	try {
		await steps.copy();
	} catch (error) {
		return { step: "copy", error };
	}
	try {
		await steps.removeOriginal();
	} catch (error) {
		return { step: "removeOriginal", error };
	}
	return null;
};
