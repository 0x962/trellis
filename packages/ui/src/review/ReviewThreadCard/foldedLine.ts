import type { Thread } from "./thread";

// The first line of a body, for the collapsed row of a resolved thread. A
// body that opens with a suggestion block names the change instead.
export const summaryOf = (body: string) => {
	const first = body.split("\n")[0] ?? "";
	return /^\s*(`{3,}|~{3,})\s*suggestion/i.test(first) ? "Suggested change" : first;
};

// Whether the card may draw as one line. A resolved thread and a thread the
// file on screen holds no more both open as one line, so neither takes the
// room of a thread the reader must still act on.
export const isCollapsible = (status: string, outdated: boolean) => status === "resolved" || outdated;

// The one line of a folded thread: why it is folded, who wrote it, the file
// and the line it points at, and the words it opens with. `resolvedBy` is
// null for the moment between the click and the server's answer, because
// only the server writes the name of the person who resolved the thread.
export const foldedLine = (thread: Thread, anchor: string | undefined, outdated: boolean, body: string): string =>
	[
		outdated ? "Outdated" : null,
		thread.status === "resolved"
			? thread.resolvedBy === null
				? "Resolved"
				: `Resolved by ${thread.resolvedBy}`
			: null,
		thread.author,
		anchor,
		summaryOf(body),
	]
		.filter((part) => part !== null && part !== undefined && part !== "")
		.join(" · ");
