// Why a load failed. A browser fetch to a port with no listener rejects
// with a TypeError. A lazy route chunk that a new build renamed fails its
// dynamic import. Every other failure carries its own message.
export type FailureKind = "offline" | "chunk" | "other";

const chunkMessages =
	/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;
const networkMessages = /Failed to fetch|NetworkError|Load failed|fetch failed/i;

export const failureKind = (error: unknown): FailureKind => {
	const message = error instanceof Error ? error.message : String(error);
	if (chunkMessages.test(message)) return "chunk";
	if (error instanceof TypeError || networkMessages.test(message)) return "offline";
	const cause = error instanceof Error ? error.cause : undefined;
	return cause === undefined ? "other" : failureKind(cause) === "offline" ? "offline" : "other";
};
