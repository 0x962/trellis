import { ORPCError } from "@orpc/server";
import { invalidInput } from "../../errors.ts";
import { revision } from "./revision.ts";

// The Git state of the workspace of an agent run, for a person who asks for
// it. `git` is a program outside the server, so it reports a directory that
// is not a repository, and a file list over the evidence byte limit, as a
// plain Error. That text becomes a refusal on the `workspace` input, so
// evidence.list, evidence.register, and evidence.workspace answer with the
// reason instead of a server failure. `revision` raises its own declared
// errors, and those pass through unchanged.
export const workspaceRevision = async (workspace: string) => {
	try {
		return await revision(workspace);
	} catch (error) {
		if (error instanceof ORPCError) throw error;
		throw invalidInput("workspace", (error as Error).message);
	}
};
