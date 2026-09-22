import { GhJsonError, parseGhJson } from "../gh/json.ts";
import type { GhSuccess } from "../gh/run.ts";
import { fail } from "./support.ts";

export const parseGhJsonForService = <T>(args: string[], result: GhSuccess): T => {
	try {
		return parseGhJson<T>(args, result.stdout, result.code);
	} catch (caught) {
		if (!(caught instanceof GhJsonError)) throw caught;
		const error = fail("GH_UNAVAILABLE", { reason: caught.failure.reason });
		error.message = caught.failure.message;
		throw error;
	}
};
