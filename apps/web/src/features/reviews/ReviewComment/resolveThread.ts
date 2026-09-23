import type { ReviewThread } from "@trellis/api";

// The answer of `reviews.list` for one pull request: every comment thread,
// how many there are, and how many still have the status open.
export type ThreadList = { items: ReviewThread[]; total: number; open: number };

// The cached thread list of one pull request, as `resolveThread` reaches it.
export type ThreadListStore = {
	read: () => ThreadList;
	write: (list: ThreadList) => void;
	// Reads the list from the server again. It runs after the call succeeds,
	// so the fields the server owns replace the ones written here.
	refetch: () => Promise<unknown>;
};

// One person resolving or reopening one thread: which thread, the status it
// takes, the name of the person, and the time they clicked.
export type ResolveChange = { id: string; resolved: boolean; by: string | null; at: string };

// The list as it looks the moment the person clicks, before the server
// answers. The `open` count is the number of threads with the status open,
// so it moves with the one thread that changed.
export const markResolved = (list: ThreadList, change: ResolveChange): ThreadList => {
	const items = list.items.map((thread) =>
		thread.id !== change.id
			? thread
			: {
					...thread,
					status: change.resolved ? ("resolved" as const) : ("open" as const),
					resolvedAt: change.resolved ? change.at : null,
					resolvedBy: change.resolved ? change.by : null,
					updatedAt: change.at,
				},
	);
	return { ...list, items, open: items.filter((thread) => thread.status === "open").length };
};

// Resolves or reopens one thread. The cached list takes the new status
// before the call goes out, so the card redraws in the same task as the
// click. A call that fails puts back the list the person saw and throws the
// reason, which the card prints.
export const resolveThread = async (
	store: ThreadListStore,
	send: (input: { id: string; resolved: boolean }) => Promise<unknown>,
	change: ResolveChange,
) => {
	const previous = store.read();
	store.write(markResolved(previous, change));
	try {
		await send({ id: change.id, resolved: change.resolved });
	} catch (cause) {
		store.write(previous);
		throw cause;
	}
	await store.refetch();
};
