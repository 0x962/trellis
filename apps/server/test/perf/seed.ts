import { sql } from "drizzle-orm";
import { linkPr, seedActors, seedChild, seedPr, seedRoot, seedStatuses, seedTicket } from "../fixtures";
import type { TestDb } from "../helpers/db.ts";

// The deterministic seed the perf suite measures against: N tickets over 3
// root projects with 8 projects each, every ticket with a 2 KB description,
// and 40 open pull requests on tickets in a started status.
//
// The tickets go in one statement per project, because 10k single row
// inserts cost more than the measurement that follows them. The 40 pull
// request tickets are numbered from 100000, above every bulk number, so two
// tickets in one root never share a number.

const ROOT_KEYS = ["PRF", "OPS", "WEB"];
const PROJECTS_PER_ROOT = 8;
const DESCRIPTION = "x".repeat(2048);
const PR_TICKET_FIRST_NUMBER = 100_000;
export const OPEN_PULL_REQUESTS = 40;

export type PerfProject = { id: string; rootId: string; statusIds: string[]; startedId: string };

const seedTree = async (db: TestDb["db"]): Promise<PerfProject[]> => {
	await seedActors(db);
	const projects: PerfProject[] = [];
	for (const key of ROOT_KEYS) {
		const rootId = await seedRoot(db, key);
		const statuses = await seedStatuses(db, rootId);
		const statusIds = [statuses.todo, statuses.started, statuses.agentReview, statuses.humanReview, statuses.done];
		projects.push({ id: rootId, rootId, statusIds, startedId: statuses.started });
		for (let index = 1; index < PROJECTS_PER_ROOT; index++) {
			const id = await seedChild(db, rootId, rootId, `p${index}`);
			projects.push({ id, rootId, statusIds, startedId: statuses.started });
		}
	}
	return projects;
};

// `share` tickets in one project, numbered from `first` upwards, cycling the
// five statuses so the due selection meets done tickets as well as started
// ones. `idFrom` is the first counter the ids come from; a 26 character id
// in the alphabet a ULID uses keeps every row the shape the others have.
const seedTickets = (db: TestDb["db"], project: PerfProject, input: { first: number; share: number; idFrom: number }) =>
	db.execute(sql`
		INSERT INTO tickets (
			id, project_id, root_id, number, title, description, priority, status_id,
			parent_id, position, version, created_at, updated_at
		)
		SELECT
			'01' || upper(lpad(to_hex(${input.idFrom}::int + g), 24, '0')),
			${project.id}, ${project.rootId}, ${input.first}::int + g,
			'Ticket ' || (${input.first}::int + g), ${DESCRIPTION}, 'none',
			(ARRAY[${sql.join(
				project.statusIds.map((id) => sql`${id}::text`),
				sql`, `,
			)}])[1 + (g % 5)],
			NULL, (g * 1024)::double precision, 1, now(), now()
		FROM generate_series(1, ${input.share}::int) g
	`);

export type PerfSeed = { projects: PerfProject[]; pullRequests: string[] };

export const seedPerf = async (db: TestDb["db"], input: { tickets: number }): Promise<PerfSeed> => {
	const projects = await seedTree(db);
	const share = Math.floor(input.tickets / projects.length);
	for (const [index, project] of projects.entries()) {
		const first = (index % PROJECTS_PER_ROOT) * share;
		await seedTickets(db, project, { first, share, idFrom: index * share * PROJECTS_PER_ROOT + 1 });
	}
	const pullRequests: string[] = [];
	for (let index = 0; index < OPEN_PULL_REQUESTS; index++) {
		const project = projects[index % projects.length]!;
		const ticket = await seedTicket(db, {
			projectId: project.id,
			rootId: project.rootId,
			statusId: project.startedId,
			number: PR_TICKET_FIRST_NUMBER + index,
		});
		const pr = await seedPr(db, { number: 1, repo: `r${index}` });
		await linkPr(db, ticket, pr);
		pullRequests.push(pr);
	}
	return { projects, pullRequests };
};
