import { errors } from "@trellis/api";

// The server stores the whole RUNNER_UNAVAILABLE message on a failed
// session. The first sentence names the runner and repeats for every
// failure, so a short line drops it and keeps what the runner said.
const prefix = `${errors.RUNNER_UNAVAILABLE.message} `;

export const startReason = (error: string | null): string => {
	if (error === null) return "the runner gave no reason";
	return error.startsWith(prefix) ? error.slice(prefix.length) : error;
};
