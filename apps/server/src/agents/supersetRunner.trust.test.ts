import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { type SupersetStubHandle, supersetStub } from "../../test/helpers/superset-stub.ts";
import type { Runner } from "./runner.ts";
import { createSupersetRunner } from "./supersetRunner.ts";
import type { FolderTrust, SeedResult } from "./trust.ts";

// The folder trust one start writes. The store here is a set in memory;
// src/agents/trust.test.ts covers the write to Claude's state file.

const url = "http://127.0.0.1:4521";
let stub: SupersetStubHandle;
let runner: Runner;
let trusted: Set<string>;

const fakeTrust = (seen: Set<string>): FolderTrust => ({
	file: "(memory)",
	trust: async (folder): Promise<SeedResult> => {
		if (seen.has(folder)) return "already";
		seen.add(folder);
		return "seeded";
	},
});

beforeEach(() => {
	stub = supersetStub(mkdtempSync(join(process.env.TRELLIS_HOME!, "superset-")), {
		projects: [{ id: "sp-web", name: "web", repo: "https://github.com/Acme/Web.git", path: "/src/web" }],
	});
	trusted = new Set<string>();
	runner = createSupersetRunner({ bin: stub.bin, url, trust: fakeTrust(trusted) });
});
afterEach(() => stub.restore());

const roots = { trustedRoots: ["/src/web"] };
const manager = { project: "CDE", runnerProjectId: "sp-web", baseBranch: "main", claudeSessionId: null, ...roots };
const builder = {
	project: "CDE",
	runnerProjectId: "sp-web",
	baseBranch: "main",
	ticket: "CDE-42",
	title: "Fix login",
	...roots,
};

// Claude asks about folder trust before it reads its prompt, so an agent
// in an unseeded folder never runs. A trusted root is the whole
// permission trellis has, and it names no Superset project, so a start
// seeds without a `projects list` call.
describe("folder trust", () => {
	test("a start seeds every trusted root of the project before it makes the workspace", async () => {
		await runner.startBuilder({ ...builder, trustedRoots: ["/src/web", "/src/other"] });
		expect([...trusted]).toEqual(["/src/web", "/src/other"]);
		expect(stub.callsOf("projects list")).toEqual([]);
		expect(stub.calls()[0]![1]).toBe("create");
	});

	// A project with no trusted folder gave trellis no permission, so the
	// session says the agent meets the dialog.
	test("a start with no trusted root writes nothing and reports the project rootless", async () => {
		const started = await runner.ensureManager({ ...manager, trustedRoots: [] });
		expect(started.trust).toEqual({ seeded: [], rootless: true });
		expect([...trusted]).toEqual([]);
		expect(stub.state().workspaces).toHaveLength(1);
	});

	// Superset cuts its worktrees outside the repo. Such a worktree needs
	// no write: Claude reads the trust of its main checkout.
	test("the workspace worktree is seeded only when a trusted root covers it", async () => {
		const outside = await runner.startBuilder(builder);
		expect(outside.trust.seeded).toEqual(["/src/web"]);

		const covered = await runner.startBuilder({
			...builder,
			ticket: "CDE-43",
			title: "Second",
			trustedRoots: ["/src/web", "/superset/worktrees"],
		});
		const second = stub.state().workspaces[1]!.worktreePath;
		expect(covered.trust.seeded).toEqual(["/superset/worktrees", second]);
	});
});
