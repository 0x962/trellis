import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { createGhRunner } from "../../../../src/gh/run.ts";
import { graphqlReply, linkPr, seedPr } from "../../../fixtures";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { freshDb, type TestDb } from "../../../helpers/db.ts";
import { ghStub } from "../../../helpers/gh-stub.ts";
import { dataOf, nextEvent, openSse, type SseReader } from "../../../helpers/sse.ts";

// The scope filters of GET /api/events on the events of a ticket's
// children: a project stream receives the comment, attachment, and pull
// request events of its tickets, and a ticket stream receives the unlink of
// its own ticket. The ping parameter takes whole seconds from 5 to 120.

let h: TestDb;
let t: TestApp;
const streams: SseReader[] = [];
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(async () => {
	for (const stream of streams.splice(0)) await stream.close();
	await h.reset();
	t = await createTestApp({ db: h });
	await t.seedProject("CDE");
});
afterAll(async () => {
	for (const stream of streams.splice(0)) await stream.close();
	await h.close();
});

const open = async (query = "", headers: Record<string, string> = {}) => {
	const stream = await openSse(t.app, `/api/events${query}`, headers);
	streams.push(stream);
	return stream;
};

describe("scope filters on child events", () => {
	test("the project filter passes the comment and attachment events of its project only", async () => {
		const other = await t.seedProject("OPS", "Operations");
		await t.createTicket({ project: "CDE", title: "Mine" });
		await t.createTicket({ project: "OPS", title: "Other" });
		const stream = await open(`?project=${other.key}&types=comment.*,attachment.*`);
		await nextEvent(stream);

		await t.api("/api/tickets/CDE-1/comments", { method: "POST", body: { body: "Not for OPS" } });
		await t.api("/api/tickets/OPS-1/comments", { method: "POST", body: { body: "For OPS" } });
		const form = new FormData();
		form.set("file", new File([new TextEncoder().encode("notes")], "notes.txt", { type: "text/plain" }));
		await t.api("/api/tickets/OPS-1/attachments", { method: "POST", raw: form });
		const comment = await nextEvent(stream);
		const attachment = await nextEvent(stream);

		expect(comment.event).toBe("comment.created");
		expect(attachment.event).toBe("attachment.created");
		const opsTicket = (await t.api("/api/tickets/OPS-1")).body.id;
		expect(dataOf<{ ticketId: string }>(comment).ticketId).toBe(opsTicket);
		expect(await stream.idle(100)).toBe(true);
	});

	test("the project filter passes the pull request events of its tickets", async () => {
		const handle = ghStub(mkdtempSync(join(process.env.TRELLIS_HOME!, "gh-events-")), {
			"api graphql": graphqlReply([{ number: 12, url: "https://github.com/acme/web/pull/12" }]),
		});
		try {
			await t.close();
			t = await createTestApp({ db: h, gh: createGhRunner() });
			const other = await t.seedProject("OPS", "Operations");
			await t.createTicket({ project: "OPS", title: "Other" });
			const stream = await open(`?project=${other.key}&types=pr.*`);
			await nextEvent(stream);

			const url = "https://github.com/acme/web/pull/12";
			await t.api("/api/tickets/OPS-1/prs", { method: "POST", body: { url } });
			const message = await nextEvent(stream);

			expect(message.event).toBe("pr.linked");
		} finally {
			handle.restore();
		}
	});

	test("a ticket stream receives the pr.unlinked of its ticket while another ticket keeps the link", async () => {
		const first = await t.createTicket({ project: "CDE", title: "One" });
		const second = await t.createTicket({ project: "CDE", title: "Two" });
		const pr = await seedPr(t.db, { number: 12 });
		await linkPr(t.db, first.id, pr);
		await linkPr(t.db, second.id, pr);
		const watching = await open("?ticket=CDE-1");
		const other = await open("?ticket=CDE-2");
		await nextEvent(watching);
		await nextEvent(other);

		const response = await t.api(`/api/tickets/CDE-1/prs/${pr}`, { method: "DELETE" });
		const seen = await nextEvent(watching);
		const seenByOther = await nextEvent(other);

		expect(response.status).toBe(200);
		expect(seen.event).toBe("pr.unlinked");
		expect(dataOf<{ ticketIds: string[] }>(seen).ticketIds).toContain(first.id);
		expect(seenByOther.event).toBe("pr.unlinked");
	});
});

describe("ping parameter", () => {
	test("a ping outside whole seconds from 5 to 120 answers INPUT_VALIDATION_FAILED", async () => {
		for (const ping of ["abc", "0", "4", "121", "5.5", "", "-10"]) {
			const response = await t.app.request(`http://trellis.test/api/events?ping=${ping}`);
			if (response.status !== 400) await response.body?.cancel();

			expect(response.status, ping).toBe(400);
			expect((await response.json()).code, ping).toBe("INPUT_VALIDATION_FAILED");
		}
	});

	test("a ping of 5 and a ping of 120 open the stream", async () => {
		for (const ping of ["5", "120"]) {
			const stream = await open(`?ping=${ping}`);

			expect(stream.response.status, ping).toBe(200);
			expect((await nextEvent(stream)).event).toBe("ready");
		}
	});
});
