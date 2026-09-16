import { ORPCError } from "@orpc/client";
import { errors } from "@trellis/api";

// The two lines a screen shows for a call that failed. `title` is the
// heading, `detail` is the one line under it that says why. `unreachable`
// is true when the request got no answer, so the server named no reason and
// the screen offers the server actions instead.
export type ErrorDescription = {
	title: string;
	detail: string;
	unreachable: boolean;
};

// The stored server URL without its scheme, such as 192.168.1.20:4521.
export const hostOf = (url: string) => url.replace(/^https?:\/\//, "");

// The heading over a reason the server itself sent.
const serverTitle = "The server sent an error";

// A rejected fetch is a TypeError in every runtime. React Native throws
// "Network request failed" and Node throws "fetch failed", so a runtime that
// throws a plain Error with one of those texts counts as the same failure.
const networkText = /network request failed|fetch failed/i;

const isNetworkFailure = (error: unknown) =>
	error instanceof TypeError || (error instanceof Error && networkText.test(error.message));

// The line for a write that lost to another actor. The screen already
// holds the row that actor wrote, so a retry is not offered. The web
// table, board, and command palette show this same sentence.
const conflictDetail = (identifier: string) => `${identifier} changed first. The row shows the other version.`;

// The message of every field the server refused, in one line.
const issueMessages = (data: unknown) =>
	errors.INPUT_VALIDATION_FAILED.data
		.parse(data)
		.issues.map((issue) => issue.message)
		.join(", ");

// The title and the reason for a rejected call. A declared error carries the
// server's own message, so every screen repeats that message word for word.
export const describeError = (error: unknown, serverUrl: string): ErrorDescription => {
	if (isNetworkFailure(error)) {
		return { title: "Cannot reach the server", detail: `${hostOf(serverUrl)} does not answer.`, unreachable: true };
	}
	if (error instanceof ORPCError && error.defined && error.code === "VERSION_CONFLICT") {
		const current = errors.VERSION_CONFLICT.data.parse(error.data).current;
		return { title: "Another actor changed the ticket", detail: conflictDetail(current.identifier), unreachable: false };
	}
	if (error instanceof ORPCError && error.defined && error.code === "INPUT_VALIDATION_FAILED") {
		return { title: serverTitle, detail: issueMessages(error.data), unreachable: false };
	}
	return { title: serverTitle, detail: error instanceof Error ? error.message : String(error), unreachable: false };
};
