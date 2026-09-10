import { describe, expect, test } from "bun:test";
import { SearchOutputSchema } from "@trellis/api";
import { createFakeServer } from "./index";

describe("fake server search", () => {
	// WS-129. An identifier comes first, a title token matches as a prefix,
	// and a project name lands in `projects`.
	test("search.query resolves identifiers, title tokens, and project names", async () => {
		const server = createFakeServer();
		const byId = SearchOutputSchema.parse(await server.client.search.query({ q: "CDE-42" }));
		expect(byId.tickets[0]!.identifier).toBe("CDE-42");
		expect((await server.client.search.query({ q: "cde-42" })).tickets[0]!.identifier).toBe("CDE-42");
		const oauth = SearchOutputSchema.parse(await server.client.search.query({ q: "oauth" }));
		expect(oauth.tickets.map((item) => item.identifier).sort()).toEqual(["CDE-51", "MRG-3", "TRL-12"]);
		expect(oauth.tickets.every((item) => /oauth/i.test(item.title))).toBe(true);
		expect(oauth.projects).toEqual([]);
		const web = SearchOutputSchema.parse(await server.client.search.query({ q: "web" }));
		expect(web.projects.map((project) => project.path)).toContain("CDE.web");
		const capped = await server.client.search.query({ q: "oauth", limit: 2 });
		expect(capped.tickets).toHaveLength(2);
		const scoped = await server.client.search.query({ q: "oauth", project: "TRL" });
		expect(scoped.tickets.map((item) => item.identifier)).toEqual(["TRL-12"]);
	});

	// WS-130. One wrong letter in a word still finds the row, the way the
	// trigram half of the server query does.
	test("search.query finds a title through a typo", async () => {
		const server = createFakeServer();
		const typo = await server.client.search.query({ q: "restor teh fork" });
		expect(typo.tickets.map((item) => item.identifier)).toContain("CDE-42");
		const exact = await server.client.search.query({ q: "restore the fork" });
		expect(exact.tickets.map((item) => item.identifier)).toContain("CDE-42");
		const nonsense = await server.client.search.query({ q: "zzzzqqq" });
		expect(nonsense.tickets).toEqual([]);
	});
});
