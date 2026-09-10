import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import {
	seedChild,
	seedComment,
	seedNested,
	seedProject,
	seedRootWithStatuses,
	seedTicket,
} from "../../../test/fixtures";
import { freshDb, type TestDb } from "../../../test/helpers/db.ts";
import { captureStatements } from "../../../test/helpers/statements.ts";
import { search } from "./search.ts";

let h: TestDb;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

type Input = Parameters<typeof search>[1];

const run = (input: Input) => h.db.transaction((tx) => search(tx, input));

const ticketIds = async (input: Input) => (await run(input)).tickets.map((row) => row.id);

const sorted = (values: string[]) => [...values].sort();

describe("search", () => {
	test("search puts the KEY-n match first", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const ticket42 = await seedTicket(h.db, {
			projectId: rootId,
			rootId,
			statusId: statuses.todo,
			number: 42,
			title: "Login page",
		});
		const followUp = await seedTicket(h.db, {
			projectId: rootId,
			rootId,
			statusId: statuses.todo,
			title: "CDE-42 follow up",
		});
		for (const q of ["CDE-42", "cde-42"]) {
			const ids = await ticketIds({ q });
			expect(ids[0]).toBe(ticket42);
			expect(ids.slice(1)).toEqual([followUp]);
		}
	});

	// A KEY-n text names a ticket. The answer is that ticket and the text
	// hits, found with the statement timeout and one statement. The trigram
	// path and the project list do not run for it.
	test("search answers a KEY-n text with one statement and no projects", async () => {
		const { rootId, statuses } = await seedProject(h.db, "CDE");
		await seedChild(h.db, rootId, rootId, "cde-42-launch", { name: "CDE-42 launch" });
		const ticket42 = await seedTicket(h.db, {
			projectId: rootId,
			rootId,
			statusId: statuses.todo,
			number: 42,
			title: "Login",
		});
		const { result, statements } = await h.db.transaction(async (tx) => {
			const capture = captureStatements(h.db.$client);
			try {
				return { result: await search(tx, { q: "CDE-42" }), statements: capture.texts };
			} finally {
				capture.restore();
			}
		});
		expect(result.tickets.map((row) => row.id)).toEqual([ticket42]);
		expect(result.projects).toEqual([]);
		expect(statements).toHaveLength(2);
		expect(statements[0]).toContain("SET LOCAL statement_timeout");
	});

	test("search finds authentication from auth by prefix", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const auth = await seedTicket(h.db, {
			projectId: rootId,
			rootId,
			statusId: statuses.todo,
			title: "Authentication flow",
		});
		await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, title: "Billing" });
		expect(await ticketIds({ q: "auth" })).toEqual([auth]);
	});

	// Every leading token must match as a whole lexeme and the last token
	// matches as a prefix, so `login auth` finds `Login authentication` and
	// not `Login page` or `Authentication flow`.
	test("search requires every leading token and prefixes the last", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const seed = (title: string) => seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, title });
		const both = await seed("Login authentication");
		await seed("Login page");
		await seed("Authentication flow");
		expect(await ticketIds({ q: "login auth" })).toEqual([both]);
	});

	test("search finds a ticket through its comments and groups by ticket", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const billing = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, title: "Billing" });
		for (const body of ["authentication broke", "authentication again", "authentication fixed"]) {
			await seedComment(h.db, billing, body);
		}
		expect(await ticketIds({ q: "authentication" })).toEqual([billing]);
	});

	// `servic` is no prefix of the lexeme `authservic`, so only the trigram
	// path (`q <% title` at threshold 0.4) finds the ticket.
	test("search finds AuthService from servic via trigram", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const ticket = await seedTicket(h.db, {
			projectId: rootId,
			rootId,
			statusId: statuses.todo,
			title: "AuthService refactor",
		});
		expect(await ticketIds({ q: "servic" })).toEqual([ticket]);
	});

	// `on` is a stop word, so the text search path finds nothing; the trigram
	// path would find `Log on` (word similarity 1) if it ran.
	test("search skips trigram under 3 characters", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, title: "AuthService refactor" });
		await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, title: "Log on" });
		expect(await ticketIds({ q: "se" })).toEqual([]);
		expect(await ticketIds({ q: "on" })).toEqual([]);
	});

	// `billing` is not similar to `Other`, so only the text search over the
	// description finds the second ticket. Weight A outranks weight B.
	test("search finds a description hit and ranks it below a title hit", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const seed = (title: string, description = "") =>
			seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, title, description });
		const inDescription = await seed("Other", "billing broke");
		const inTitle = await seed("Billing page");
		expect(await ticketIds({ q: "billing" })).toEqual([inTitle, inDescription]);
	});

	// `flies` and `fly` stem to `fli`; their trigrams share 2 of 6, under the
	// threshold 0.4. Only the text search path finds the ticket.
	test("search matches a stemmed word that no trigram finds", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const ticket = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, title: "Fly wheel" });
		expect(await ticketIds({ q: "flies" })).toEqual([ticket]);
	});

	// `OR` before the last token keeps its websearch meaning: either side matches.
	test("search keeps OR before the prefixed last token", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const seed = (title: string) => seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, title });
		const auth = await seed("Authentication flow");
		const login = await seed("Login page");
		await seed("Billing");
		expect(sorted(await ticketIds({ q: "login OR auth" }))).toEqual(sorted([auth, login]));
	});

	// `OR` binds weaker than the space between words, as in websearch_to_tsquery:
	// `login OR billing token` is `login | (billing & token)`, so the prefix
	// applies to the last AND group only. A lowercase `or` is the same operator.
	test("search keeps OR semantics when the last group has several words", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const seed = (title: string) => seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, title });
		const login = await seed("Login page");
		const billing = await seed("Billing token");
		await seed("Widget");
		expect(sorted(await ticketIds({ q: "login OR billing token" }))).toEqual(sorted([login, billing]));
		expect(sorted(await ticketIds({ q: "login OR billing tok" }))).toEqual(sorted([login, billing]));
		expect(sorted(await ticketIds({ q: "login or billing" }))).toEqual(sorted([login, billing]));
		expect(await ticketIds({ q: "page OR widget tok" })).toEqual([login]);
	});

	// tickets.number is a 32-bit integer; a larger number matches no ticket
	// and the text goes through the text search path.
	test("search treats an identifier beyond the integer range as text", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, number: 42, title: "Login page" });
		expect(await ticketIds({ q: "CDE-2147483648" })).toEqual([]);
		expect(await ticketIds({ q: "CDE-99999999999999999999" })).toEqual([]);
	});

	test("search dedupes a ticket matched by both paths", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const ticket = await seedTicket(h.db, {
			projectId: rootId,
			rootId,
			statusId: statuses.todo,
			title: "Authentication",
		});
		expect(await ticketIds({ q: "authentic" })).toEqual([ticket]);
	});

	test("search caps at 20 and ranks title hits first", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const titled: string[] = [];
		for (let i = 0; i < 30; i++) {
			titled.push(
				await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, title: `Auth task ${i}` }),
			);
		}
		const described = await seedTicket(h.db, {
			projectId: rootId,
			rootId,
			statusId: statuses.todo,
			title: "Other",
			description: "auth",
		});
		const page = await ticketIds({ q: "auth" });
		expect(page).toHaveLength(20);
		for (const id of page) expect(titled).toContain(id);
		expect(await ticketIds({ q: "auth", limit: 5 })).toHaveLength(5);
		const all = await ticketIds({ q: "auth", limit: 31 });
		expect(all).toHaveLength(31);
		expect(all.at(-1)).toBe(described);
	});

	test("search sets a local 200 ms statement timeout", async () => {
		await seedProject(h.db);
		await h.db.transaction(async (tx) => {
			await search(tx, { q: "auth" });
			const inside = await tx.execute(sql`SHOW statement_timeout`);
			expect(inside.rows[0]?.statement_timeout).toBe("200ms");
		});
		const outside = await h.db.execute(sql`SHOW statement_timeout`);
		expect(outside.rows[0]?.statement_timeout).toBe("0");
	});

	test("search narrows to the project subtree", async () => {
		const cde = await seedProject(h.db, "CDE");
		const ops = await seedRootWithStatuses(h.db, "OPS");
		const inCde = await seedTicket(h.db, {
			projectId: cde.rootId,
			rootId: cde.rootId,
			statusId: cde.statuses.todo,
			title: "Authentication",
		});
		await seedTicket(h.db, {
			projectId: ops.rootId,
			rootId: ops.rootId,
			statusId: ops.statuses.todo,
			title: "Authentication",
		});
		expect(await ticketIds({ q: "auth", projectIds: [cde.rootId] })).toEqual([inCde]);
	});

	test("search returns matching projects beside tickets", async () => {
		const { rootId: cde } = await seedProject(h.db, "CDE");
		const web = await seedChild(h.db, cde, cde, "web");
		const auth = await seedChild(h.db, web, cde, "auth", { name: "Auth" });
		await seedRootWithStatuses(h.db, "OPS");
		const result = await run({ q: "auth" });
		expect(sorted(result.projects.map((project) => project.id))).toEqual([auth]);
	});

	// The plan sets no maximum depth for the project tree, so a project 70
	// levels down is found with its path and its depth.
	test("search finds a project deeper than 64 levels", async () => {
		const { rootId } = await seedProject(h.db, "CDE");
		const chain = await seedNested(h.db, rootId, 70);
		const deepest = chain.at(-1) as string;
		await h.db.execute(sql`UPDATE projects SET name = 'Deep auth' WHERE id = ${deepest}`);
		const result = await run({ q: "deep auth" });
		expect(result.projects.map((project) => project.id)).toEqual([deepest]);
		expect(result.projects[0]?.depth).toBe(70);
		expect(result.projects[0]?.path).toBe(`CDE.${chain.map((_, i) => `p${i + 1}`).join(".")}`);
	});
});
