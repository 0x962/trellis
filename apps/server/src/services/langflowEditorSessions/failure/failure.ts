import { ORPCError } from "@orpc/server";

export function editorFailure(code: string, status = 403) {
	return new ORPCError(code, { status, message: "The editor request is not authorized." });
}
