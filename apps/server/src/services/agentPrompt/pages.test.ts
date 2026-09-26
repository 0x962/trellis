import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import { getRun, type LaunchRun } from "../agentRuns/queries.ts";
import { create as createTicket } from "../tickets/create.ts";
import { launchGuide } from "./launchGuide.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let ctx: ServiceCtx;
let run: LaunchRun;
const at = new Date("2026-09-25T12:00:00Z");
const tx = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

beforeAll(async () => {
	db = await openTestDb();
	const projectId = ulid();
	await db.execute(
		sql`INSERT INTO projects (id,key,slug,name,created_at,updated_at) VALUES (${projectId},'ART','art','Artifacts',${at},${at})`,
	);
	await db.execute(
		sql`INSERT INTO statuses (id,project_id,name,slug,category,color,position,is_default,created_at,updated_at) VALUES (${ulid()},${projectId},'Todo','todo','todo','fg-muted',0,true,${at},${at})`,
	);
	const cache = createCache();
	await tx((tx) => cache.rebuild(tx));
	ctx = {
		actor: { kind: "human", name: "Sam" },
		session: null,
		reqId: ulid(),
		now: at,
		cache,
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://example.local",
	};
	const ticket = await tx((tx) => createTicket(ctx, tx, { project: "ART", title: "Create a dashboard" }));
	const id = ulid();
	await db.execute(
		sql`INSERT INTO agent_runs (id,name,kind,instruction,project_id,project_key,ticket_id,ticket_identifier,created_at,updated_at) VALUES (${id},'Builder','agent','Create a dashboard',${projectId},'ART',${ticket.id},${ticket.identifier},${at},${at})`,
	);
	run = await tx((tx) => getRun(tx, id));
}, 30_000);

afterAll(async () => db.$client.close());

for (const scope of ["ticket", "project session", "standalone session", "flow"] as const) {
	test(`${scope} receives Page delivery rules at launch and resume`, async () => {
		const scopedRun = {
			...run,
			kind: scope === "ticket" ? ("agent" as const) : scope === "flow" ? ("flow" as const) : ("session" as const),
			projectId: scope === "standalone session" ? null : run.projectId,
			ticketId: scope === "ticket" || scope === "flow" ? run.ticketId : null,
		};
		const runtime = { core: ctx, now: () => at, newTx: tx } as Parameters<typeof launchGuide>[0];
		for (const message of [undefined, "Revise the same artifact"]) {
			const prompt = await launchGuide(runtime, {
				run: scopedRun,
				workspace: "/not-a-repository",
				attemptId: "attempt",
				message,
				env: {},
			});
			const delivery = prompt.split("### Deliver artifacts to the user\n")[1]?.split("### Page commands")[0];
			expect(delivery).toBeDefined();
			for (const text of [
				"Use Trellis Pages for every artifact you create to present to the user",
				"Prototypes",
				"Dashboards",
				"Pages",
				"Insights",
				"Other presentation artifacts",
				"across all projects, ticket assignments, and sessions",
				"If the user explicitly requests another format or destination, follow that request.",
				"general workspace guidance requires local-only presentation or says never to publish artifacts",
				"A local file alone does not complete delivery.",
				"Establish the correct project before publication, including for a session without a project.",
				"If the correct project is unclear, ask the user before publication.",
				"Build the HTML source and its assets locally.",
				"Keep the local source available for later edits.",
				"trellis page publish <path> --project <project> --title <text>",
				"Give the user the returned `trellis://page/<id>` link.",
				"add the page link to that ticket's description",
				"Preserve the existing request and other ticket content.",
				"Verify the saved link with `trellis ticket show <ticket>`.",
				"publish a new version of the existing page",
				"`--page` and `--expected-version`",
				"Keep the same page link in the ticket and your reply.",
			])
				expect(delivery).toContain(text);
			if (message !== undefined) expect(prompt).toContain(message);
			expect(prompt).not.toMatch(/\{\{[a-z_.]+\}\}/);
		}
	});
}
