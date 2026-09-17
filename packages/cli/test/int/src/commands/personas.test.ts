import { describe, expect, test } from "bun:test";
import { lines, runCli } from "../../../deps.ts";
import { persona, personaId, personaId2 } from "../../../fixtures.ts";

const set = () => [
	persona(),
	persona({ id: personaId2, name: "Trellis Manager", kind: "manager", instruction: "Run the board." }),
];

describe("personas list", () => {
	// CLI-120
	test("personas list prints one row per persona", async () => {
		const result = await runCli(["personas", "list"], { "personas.list": set() }, { tty: true });
		expect(result.code).toBe(0);
		expect(result.calls[0]).toMatchObject({ path: "personas.list", input: {} });
		const [header, ...rows] = lines(result.stdout);
		const names = header!
			.trim()
			.split(/\s{2,}/)
			.map((name) => name.toLowerCase());
		for (const name of ["id", "kind", "name"]) expect(names, name).toContain(name);
		expect(rows).toHaveLength(2);
		expect(rows[0]).toContain("Feature Builder");
		expect(rows[1]).toContain("manager");
	});

	// CLI-121: the list route takes no filter, so --kind keeps rows here.
	test("personas list --kind keeps one kind", async () => {
		const result = await runCli(["personas", "list", "--kind", "manager"], { "personas.list": set() });
		expect(result.code).toBe(0);
		expect(JSON.parse(result.stdout)).toMatchObject([{ id: personaId2 }]);

		const quiet = await runCli(["personas", "list", "--kind", "builder", "--quiet"], { "personas.list": set() });
		expect(lines(quiet.stdout)).toEqual([personaId]);

		const wrong = await runCli(["personas", "list", "--kind", "coach"], { "personas.list": set() });
		expect(wrong.code).toBe(2);
		expect(wrong.stderr).toContain("builder, reviewer, manager");
	});
});

describe("personas show", () => {
	// CLI-122
	test("personas show reads one persona by id and matches a name in the list", async () => {
		const byName = await runCli(["personas", "show", "trellis manager"], { "personas.list": set() }, { tty: true });
		expect(byName.code).toBe(0);
		expect(byName.calls[0]).toMatchObject({ path: "personas.list" });
		expect(byName.stdout).toContain(personaId2);
		expect(byName.stdout).toContain("Run the board.");

		const byId = await runCli(["personas", "show", personaId], { "personas.get": persona() }, { tty: true });
		expect(byId.code).toBe(0);
		expect(byId.calls[0]).toMatchObject({ path: "personas.get", input: { id: personaId } });
		expect(byId.stdout).toContain("Open a pull request.");

		// A pipe answers the row, so the instruction travels as one JSON field.
		const piped = await runCli(["personas", "show", personaId], { "personas.get": persona() });
		expect(JSON.parse(piped.stdout)).toMatchObject({ id: personaId, instruction: persona().instruction });
	});

	// CLI-123
	test("personas show exits 3 for a name no persona carries", async () => {
		const result = await runCli(["personas", "show", "Nobody"], { "personas.list": set() });
		expect(result.code).toBe(3);
		expect(result.stderr).toEndWith(" (NOT_FOUND)\n");
		expect(result.stderr).toContain("Nobody");
	});
});
