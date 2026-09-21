import { ORPCError } from "@orpc/client";

// Why a load failed. A browser fetch to a port with no listener rejects
// with a TypeError. A lazy route chunk that a new build renamed fails its
// dynamic import. The host refuses a request that carries no host token or
// the wrong one (401), and a request from a browser origin or a hostname it
// does not serve (403). Every other failure carries its own message.
export type FailureKind = "offline" | "chunk" | "refused" | "other";

const chunkMessages =
	/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;
const networkMessages = /Failed to fetch|NetworkError|Load failed|fetch failed/i;

const refused = (error: unknown) => error instanceof ORPCError && (error.status === 401 || error.status === 403);

export const failureKind = (error: unknown): FailureKind => {
	if (refused(error)) return "refused";
	const message = error instanceof Error ? error.message : String(error);
	if (chunkMessages.test(message)) return "chunk";
	if (error instanceof TypeError || networkMessages.test(message)) return "offline";
	const cause = error instanceof Error ? error.cause : undefined;
	if (cause === undefined) return "other";
	const causeKind = failureKind(cause);
	return causeKind === "offline" || causeKind === "refused" ? causeKind : "other";
};
