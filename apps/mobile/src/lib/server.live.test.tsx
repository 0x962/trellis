import { describe, expect, test } from "@jest/globals";
import { reset, seedProject, seedTicket } from "../../test/seed";
import { actorName, directFetch, human, seeder, serverUrl } from "../../test/server";
import { actorHeader, probeHealth } from "./server";

// The setup screen is the only screen whose calls no other test makes:
// `system.health`, `tickets.counts`, and `actors.default`. The unit test
// answers all three from a stub, so this one runs them against the server
// the suite spawns.

describe("probeHealth against the real server", () => {
	test("reads the version, the ticket count, and the default actor", async () => {
		await reset(seeder);
		await seedProject(seeder, { key: "PRB", name: "Probe" });
		for (const title of ["The first ticket", "The second ticket"]) {
			await seedTicket(seeder, { project: "PRB", title });
		}
		const counts = await human.tickets.counts({});
		const defaultActor = await human.actors.default();
		const health = await human.system.health();

		const result = await probeHealth(serverUrl, actorHeader(actorName), { fetch: directFetch });
		expect(result).toEqual({
			ok: true,
			version: health.version,
			apiVersion: health.apiVersion,
			ticketCount: counts.total,
			actorName: defaultActor.name,
		});
		expect(counts.total).toBe(2);
	});

	// The client parses the actor header before it opens a socket, so a name
	// outside the grammar never reaches the server.
	test("refuses an actor name outside the header grammar", async () => {
		await expect(probeHealth(serverUrl, actorHeader("dana:lee"), { fetch: directFetch })).rejects.toThrow();
	});
});
