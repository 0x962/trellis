import { ActorHeaderSchema, type TrellisClient } from "@trellis/api";
import { useSyncExternalStore } from "react";

// The identity the web app acts as. The web only ever stores a human; an
// agent comes through the CLI with its own header.
export type StoredActor = { name: string; kind: "human" };

export const actorStorageKey = "trellis.actor";

const listeners = new Set<() => void>();

// The parsed value of the last raw string read, so a render that reads the
// actor twice gets one object and useSyncExternalStore sees a stable snapshot.
let cachedRaw: string | null = null;
let cachedActor: StoredActor | null = null;

export const readActor = (): StoredActor | null => {
	const raw = localStorage.getItem(actorStorageKey);
	if (raw !== cachedRaw) {
		cachedRaw = raw;
		cachedActor = raw === null ? null : (JSON.parse(raw) as StoredActor);
	}
	return cachedActor;
};

// No stored identity is the first-run signal the root route reads.
export const hasActor = () => readActor() !== null;

// The `x-trellis-actor` value, or null before setup.
export const actorHeader = (): string | null => {
	const actor = readActor();
	return actor === null ? null : `${actor.kind}:${actor.name}`;
};

// Stores a human identity. The header grammar is checked first, so a name
// the server would refuse never reaches localStorage.
export const setActorName = (name: string) => {
	ActorHeaderSchema.parse(`human:${name}`);
	localStorage.setItem(actorStorageKey, JSON.stringify({ name, kind: "human" }));
	for (const listener of listeners) listener();
};

export const subscribeActor = (listener: () => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};

// The name the setup form starts with. Nothing is stored until Continue.
export const suggestedActorName = async (client: TrellisClient) => (await client.actors.default()).name;

// The stored identity, re-read on every change.
export const useActor = () => useSyncExternalStore(subscribeActor, readActor);
