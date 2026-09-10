import type { TrellisEvent } from "@trellis/api";
import type { Db } from "./client.ts";

// The transaction handle every query and service receives. A query never
// reaches for the database itself: a second statement on the instance while
// a transaction holds it waits for that transaction and never returns.
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type Emit = (event: TrellisEvent) => void;

export type EventSink = (events: TrellisEvent[]) => void | Promise<void>;

// Runs `fn` in one transaction and hands it the transaction and an event
// collector. The events reach `sink` after the commit and never before: a
// client that refetches on an event must see the committed rows. A throw
// rolls the transaction back and drops the queued events.
export const withTx = async <T>(db: Db, fn: (tx: Tx, emit: Emit) => Promise<T>, sink?: EventSink) => {
	const events: TrellisEvent[] = [];
	const emit: Emit = (event) => {
		events.push(event);
	};
	const result = await db.transaction((tx) => fn(tx, emit));
	if (sink && events.length > 0) await sink(events);
	return { result, events };
};
