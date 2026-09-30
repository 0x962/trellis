import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { setLocalState } from "../../services/pullRequestLocalState.ts";
import { link, setHeadSha } from "../../services/pullRequests.ts";
import { localReviewFixture } from "../../services/reviews/localReviewState/fixture.ts";
import { submit } from "../../services/reviews/remote.ts";
import type { Db } from "../client.ts";
import { insertPr } from "./history.ts";

export const cases = [
	"before-0099",
	"human-default",
	"before-0106",
	"timestamp",
	"pushed-linked",
	"pushed-unlinked",
	"deleted-ticket",
	"withdrawn",
	"explicit-approved",
	"implicit-approved",
	"withdrawn-approved",
	"other-activity",
	"closed",
	"merged-approved",
] as const;

export async function seed(db: Db, historical: Map<string, string>) {
	const h = await localReviewFixture(db);
	const ids = new Map(historical);
	for (const name of cases) {
		if (ids.has(name)) continue;
		const id = ulid();
		ids.set(name, id);
		await insertPr(db, id, cases.indexOf(name) + 1);
	}
	const mark = (name: string, localState: "ready" | "not-ready") =>
		h.run((tx) => setLocalState(h.ctx(h.agent), tx, { id: ids.get(name)!, localState }));
	const push = (name: string) => h.run((tx) => setHeadSha(tx, { id: ids.get(name)!, headSha: "new-head" }));
	const connect = async (name: (typeof cases)[number]) => {
		const number = cases.indexOf(name) + 1;
		await h.run((tx) =>
			link(h.ctx(h.human), tx, {
				ticket: "GLY-1",
				url: `https://github.com/upgrade/review/pull/${number}`,
				ref: { owner: "upgrade", repo: "review", number },
				fetched: { error: "Isolated fixture" },
			}),
		);
	};
	await connect("human-default");
	await mark("timestamp", "ready");
	for (const name of ["pushed-linked", "explicit-approved", "withdrawn"] as const) {
		await connect(name);
		await mark(name, "ready");
		await push(name);
	}
	await mark("withdrawn", "not-ready");
	await mark("pushed-unlinked", "ready");
	await push("pushed-unlinked");
	const deletedId = ulid();
	await db.execute(sql`INSERT INTO tickets (id, project_id, number, title, status_id, position, created_at, updated_at)
		SELECT ${deletedId}, project_id, 2, 'Deleted link', status_id, 1, created_at, updated_at FROM tickets WHERE number=1`);
	await h.run((tx) =>
		link(h.ctx(h.human), tx, {
			ticket: "GLY-2",
			url: "https://github.com/upgrade/review/pull/7",
			ref: { owner: "upgrade", repo: "review", number: 7 },
			fetched: { error: "Isolated fixture" },
		}),
	);
	await mark("deleted-ticket", "ready");
	await push("deleted-ticket");
	await db.execute(sql`UPDATE pull_requests SET review_retained=true WHERE id=${ids.get("deleted-ticket")!}`);
	await db.execute(sql`DELETE FROM tickets WHERE id=${deletedId}`);
	await mark("withdrawn-approved", "not-ready");
	for (const name of ["explicit-approved", "implicit-approved", "withdrawn-approved", "merged-approved"] as const) {
		const pr = `https://github.com/upgrade/review/pull/${cases.indexOf(name) + 1}`;
		for (const [actor, verdict] of [
			[h.human, "approve"],
			[h.human, "comment"],
			[h.agent, "request_changes"],
		] as const)
			await h.run((tx) =>
				submit(h.ctx(actor), tx, {
					pr,
					verdict,
					body: `Retain exact approval: ${name}\nα`,
					threadIds: [],
					headSha: "original-head",
				}),
			);
	}
	await db.execute(sql`UPDATE pull_requests SET state='closed' WHERE id=${ids.get("closed")!}`);
	await db.execute(sql`UPDATE pull_requests SET state='merged' WHERE id=${ids.get("merged-approved")!}`);
	return { h, ids, mark, push };
}
