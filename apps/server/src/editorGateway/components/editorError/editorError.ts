import { ORPCError } from "@orpc/server";

export async function editorError(
	error: unknown,
	input: { requestId?: string },
	readVersion: () => Promise<number>,
): Promise<never> {
	if (!(error instanceof ORPCError)) throw error;
	if (error.code === "FLOW_VERSION_CONFLICT" && error.data === undefined)
		throw new ORPCError("FLOW_VERSION_CONFLICT", {
			status: 412,
			defined: true,
			data: { version: await readVersion() },
		});
	if (error.code === "FLOW_REQUEST_CONFLICT" && error.data === undefined)
		throw new ORPCError("FLOW_REQUEST_CONFLICT", { status: 409, defined: true, data: { requestId: input.requestId } });
	if (["EDITOR_ACTOR_UNCONFIGURED", "EDITOR_SAVE_IN_PROGRESS", "EDITOR_SESSION_REQUIRED"].includes(error.code))
		throw new ORPCError(error.code, { status: error.status, defined: true, message: error.message });
	if (error.code === "FLOW_UNSUPPORTED_FORMAT" && error.data === undefined)
		throw new ORPCError("EDITOR_FLOW_UNSUPPORTED", { status: 409, defined: true });
	if (error.status === 403)
		throw new ORPCError("EDITOR_ACCESS_REFUSED", {
			status: 403,
			defined: true,
			data: { code: error.code, status: 403 },
		});
	throw error;
}
