import type { Inbox } from "@trellis/api";
import { createFakeServer, type FakeServer } from "./fakeServer";

const hour = 60 * 60 * 1000;

const rowOf = (server: FakeServer, identifier: string) => {
	const [key, number] = identifier.split("-");
	const root = [...server.state.projects.values()].find((project) => project.parentId === null && project.key === key)!;
	return [...server.state.tickets.values()].find((row) => row.rootId === root.id && row.number === Number(number))!;
};

const statusOf = (server: FakeServer, identifier: string, slug: string) => {
	const row = rowOf(server, identifier);
	return [...server.state.statuses.values()].find((status) => status.projectId === row.rootId && status.slug === slug)!;
};

export const totals = (inbox: Inbox) => [
	inbox.review.total,
	inbox.failingCi.total,
	inbox.stalled.total,
	inbox.doneByAgentsToday.total,
];

// An empty inbox with `started` tickets that agents hold. The project is DOC.
export const emptyInboxServer = async (started: number) => {
	const server = createFakeServer({ empty: true });
	await server.client.projects.create({ key: "DOC", name: "Docs" });
	const agent = server.clientAs("agent:claude-code");
	for (let index = 0; index < started; index += 1) {
		const ticket = await agent.tickets.create({ project: "DOC", title: `Agent work ${index + 1}` });
		await agent.tickets.move({ ticket: ticket.identifier, status: "in-progress" });
	}
	return server;
};

// The seeded server with Review 0, Failing CI 0, Stalled 2, and Done by
// agents today 6. The review rows go to Todo, the CDE-44 check passes, and
// CDE-41 goes quiet for three days.
export const quietInboxServer = () => {
	const server = createFakeServer();
	for (const identifier of ["CDE-42", "CDE-37", "TRL-9"]) {
		rowOf(server, identifier).statusId = statusOf(server, identifier, "todo").id;
	}
	for (const pr of server.state.prs.values()) {
		for (const check of pr.checks) {
			if (check.bucket === "fail") check.bucket = "pass";
		}
	}
	rowOf(server, "CDE-41").updatedAt = new Date(Date.now() - 72 * hour).toISOString();
	return server;
};

// Adds `count` copies of CDE-42 to Human Review, so the Review section
// overflows its 100-row cap.
export const padReview = (server: FakeServer, count: number) => {
	const source = rowOf(server, "CDE-42");
	for (let index = 0; index < count; index += 1) {
		const id = `01J8Z6X4Q3M2K1H0G9F8E7${String(index).padStart(4, "0")}`;
		server.state.tickets.set(id, { ...source, id, number: 1000 + index, parentId: null, title: `Review ${index}` });
	}
};

// The server's stored version of one ticket, bumped by one without an
// event. The next move that carries the old version is VERSION_CONFLICT.
export const bumpVersion = (server: FakeServer, identifier: string) => {
	rowOf(server, identifier).version += 1;
};
