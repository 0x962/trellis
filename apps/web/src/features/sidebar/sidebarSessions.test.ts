import { expect, test } from "bun:test";
import type { Session } from "@trellis/api";
import { archivedSessions, openSessions } from "./sidebarSessions";

const session = (fields: Partial<Session>) =>
	({ id: fields.name ?? "session", name: "session", projectId: null, archivedAt: null, ...fields }) as Session;

const open = session({ name: "wispy-harbor" });
const archived = session({ name: "amber-delta", archivedAt: "2026-09-24T03:25:40.470Z" });
const owned = session({ name: "quiet-meadow", projectId: "01M24SPHTX36AJ3VKTNZ263E7V" });
const all = [open, archived, owned];

test("the Sessions section holds the sessions of no project that nobody archived", () => {
	expect(openSessions(all).map((row) => row.name)).toEqual(["wispy-harbor"]);
});

test("the Archived section holds the sessions a person archived", () => {
	expect(archivedSessions(all).map((row) => row.name)).toEqual(["amber-delta"]);
});

test("the two sections take no session two times", () => {
	const drawn = [...openSessions(all), ...archivedSessions(all)].map((row) => row.name);

	expect(new Set(drawn).size).toBe(drawn.length);
});
