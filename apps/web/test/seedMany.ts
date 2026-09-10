import type { Priority } from "@trellis/api";
import type { FakeServer } from "./fake-server";
import { createSeeder } from "./fake-server/seeder";
import { findProject } from "./fake-server/state";

export type SeedManyOptions = {
	// The project path, `CDE` or `CDE.web`. The tickets take its root's numbers.
	project: string;
	count: number;
	// A status slug of the project's set. `todo` by default.
	status?: string;
	priority?: Priority;
};

// Adds `count` tickets to the fake server, numbered after the root's last
// ticket. Every ticket is a plain row by navid; a higher number is a more
// recent update, so the default order lists them newest number first.
export const seedTickets = (server: FakeServer, options: SeedManyOptions) => {
	const project = findProject(server.state, options.project)!;
	const root = server.state.projects.get(project.rootId)!;
	const seeder = createSeeder(server.state, Date.now());
	const first = root.ticketCounter + 1;
	const identifiers: string[] = [];
	for (let index = 0; index < options.count; index += 1) {
		const number = first + index;
		seeder.addTicket({
			project,
			number,
			title: `Seeded ticket ${number}`,
			status: options.status ?? "todo",
			priority: options.priority ?? "none",
			actor: "navid",
			updatedAgo: (options.count - index) * 60_000,
		});
		identifiers.push(`${root.key}-${number}`);
	}
	return identifiers;
};
