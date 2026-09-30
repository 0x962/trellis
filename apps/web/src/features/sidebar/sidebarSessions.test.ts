import { expect, test } from "bun:test";
import type { Session } from "@trellis/api";
import { openSessions } from "./sidebarSessions";

const session = (fields: Partial<Session>) =>
	({
		id: fields.name ?? "session",
		name: "session",
		projectId: null,
		pinnedAt: null,
		archivedAt: null,
		createdAt: "2026-09-24T12:00:00.000Z",
		...fields,
	}) as Session;

const open = session({ name: "wispy-harbor" });
const archived = session({ name: "amber-delta", archivedAt: "2026-09-24T03:25:40.470Z" });
const owned = session({ name: "quiet-meadow", projectId: "01M24SPHTX36AJ3VKTNZ263E7V" });
const all = [open, archived, owned];

test("the Sessions section holds the sessions of no project that nobody archived", () => {
	expect(openSessions(all).map((row) => row.name)).toEqual(["wispy-harbor"]);
});

test("a pinned session leads the Sessions section", () => {
	const newer = session({ name: "newer", createdAt: "2026-09-24T13:00:00.000Z" });
	const pinned = session({ name: "pinned", pinnedAt: "2026-09-24T11:00:00.000Z" });
	expect(openSessions([newer, pinned]).map((row) => row.name)).toEqual(["pinned", "newer"]);
});
