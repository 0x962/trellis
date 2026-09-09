import type { Scheduler } from "./scheduler.ts";

// How long a deleted ticket's id stays tombstoned. A create or update for
// the id that arrives inside this window applies nothing. Such an event is
// a straggler that the server emitted before the delete's commit.
export const TOMBSTONE_MS = 60_000;

export type Tombstones = {
	add: (id: string) => void;
	has: (id: string) => boolean;
};

// The time of each delete, by ticket id. An entry older than `TOMBSTONE_MS`
// is expired, and every add prunes the expired ones.
export const createTombstones = (scheduler: Scheduler): Tombstones => {
	const deletedAtById = new Map<string, number>();

	const has = (id: string) => {
		const deletedAt = deletedAtById.get(id);
		return deletedAt !== undefined && scheduler.now() - deletedAt < TOMBSTONE_MS;
	};

	const add = (id: string) => {
		const now = scheduler.now();
		for (const [other, deletedAt] of deletedAtById) if (now - deletedAt >= TOMBSTONE_MS) deletedAtById.delete(other);
		deletedAtById.set(id, now);
	};

	return { add, has };
};
