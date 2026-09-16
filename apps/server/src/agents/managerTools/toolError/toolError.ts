import { ORPCError } from "@orpc/server";
import { z } from "zod";

export const toolError = (error: unknown) => {
	if (error instanceof ORPCError) return JSON.stringify({ code: error.code, message: error.message, data: error.data });
	if (error instanceof z.ZodError)
		return JSON.stringify({
			code: "INPUT_VALIDATION_FAILED",
			message: "The tool input does not match its schema.",
			data: { issues: error.issues.map(({ code, path, message }) => ({ code, path, message })) },
		});
	return error instanceof Error ? error.message : String(error);
};
