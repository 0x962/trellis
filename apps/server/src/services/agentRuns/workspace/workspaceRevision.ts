import { ORPCError } from "@orpc/server";
import { invalidInput } from "../../../errors.ts";
import { revision } from "./revision.ts";

// `git` reports an unreadable repository as a plain Error. The API returns
// that text on the `workspace` input. `revision` errors keep their declared
// API codes.
export const workspaceRevision = async (workspace: string) => {
	try {
		return await revision(workspace);
	} catch (error) {
		if (error instanceof ORPCError) throw error;
		throw invalidInput("workspace", (error as Error).message);
	}
};
