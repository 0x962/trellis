import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { count, linkPr, seedAttachment, seedChild, seedPr, seedProject, seedTicket } from "../../test/fixtures";
import { testCtx, withEmit } from "../../test/helpers/ctx.ts";
import { freshDb, type TestDb } from "../../test/helpers/db.ts";
import { caught } from "../../test/helpers/errors.ts";
import { freshHomeWithDirs } from "../../test/helpers/home.ts";
import { assertStatusInvariant } from "../../test/invariants.ts";
import { type Tx, withTx } from "../db/tx.ts";
import * as attachments from "./attachments.ts";
import * as pullRequests from "./pullRequests.ts";
import type { ServiceCtx } from "./support.ts";

// An archived project, or one below an archived ancestor, accepts no
// mutation. The attachment and pull request services refuse an upload, a
// delete, a link, and an unlink there with PROJECT_ARCHIVED, and leave the
// rows as they were.

let h: TestDb;
let home: string;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(async () => {
	await h.reset();
	home = freshHomeWithDirs();
});
afterEach(() => h.db.transaction(assertStatusInvariant));
afterAll(() => h.close());

// CDE-1 sits in the sub-project CDE.web, with one attachment and one linked
// pull request. `archive` names the project that gets the archive stamp.
const seedArchived = async (archive: "root" | "project") => {
	const { rootId, statuses } = await seedProject(h.db);
	const webId = await seedChild(h.db, rootId, rootId, "web");
	const ticket = await seedTicket(h.db, { projectId: webId, rootId, statusId: statuses.todo, number: 1 });
	const attachment = await seedAttachment(h.db, ticket);
	const pr = await seedPr(h.db, { number: 12 });
	await linkPr(h.db, ticket, pr);
	const archivedId = archive === "root" ? rootId : webId;
	await h.db.execute(sql`UPDATE projects SET archived_at = now() WHERE id = ${archivedId}`);
	return { attachment, pr };
};

const run = <T>(fn: (ctx: ServiceCtx, tx: Tx) => Promise<T>) => {
	const handle = testCtx({ db: h.db, home });
	return withTx(h.db, (tx, emit) => fn(withEmit(handle.ctx, emit), tx));
};

const png = () => new File([new TextEncoder().encode("pixels")], "shot.png", { type: "image/png" });

describe.each(["root", "project"] as const)("io writes under an archived %s", (archive) => {
	test("an upload throws PROJECT_ARCHIVED", async () => {
		await seedArchived(archive);

		const error = await caught(run((ctx, tx) => attachments.upload(ctx, tx, { ticket: "CDE-1", file: png() })));

		expect(error.code).toBe("PROJECT_ARCHIVED");
		expect(await count(h.db, "attachments")).toBe(1);
	});

	test("an attachment delete throws PROJECT_ARCHIVED", async () => {
		const { attachment } = await seedArchived(archive);

		const error = await caught(run((ctx, tx) => attachments.remove(ctx, tx, { id: attachment })));

		expect(error.code).toBe("PROJECT_ARCHIVED");
		expect(await count(h.db, "attachments")).toBe(1);
	});

	test("a pull request link throws PROJECT_ARCHIVED", async () => {
		await seedArchived(archive);

		const error = await caught(
			run((ctx, tx) => pullRequests.link(ctx, tx, { ticket: "CDE-1", url: "https://github.com/acme/web/pull/13" })),
		);

		expect(error.code).toBe("PROJECT_ARCHIVED");
		expect(await count(h.db, "pull_requests")).toBe(1);
	});

	test("a pull request unlink throws PROJECT_ARCHIVED", async () => {
		const { pr } = await seedArchived(archive);

		const error = await caught(run((ctx, tx) => pullRequests.unlink(ctx, tx, { ticket: "CDE-1", id: pr })));

		expect(error.code).toBe("PROJECT_ARCHIVED");
		expect(await count(h.db, "ticket_pull_requests")).toBe(1);
	});
});
