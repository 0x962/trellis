import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { type SupersetStubHandle, supersetStub } from "../../../helpers/superset-stub.ts";
import type { Runner } from "../../../../src/agents/runner.ts";
import { createSupersetRunner } from "../../../../src/agents/supersetRunner.ts";

let stub: SupersetStubHandle;
let runner: Runner;

beforeEach(() => {
	stub = supersetStub(mkdtempSync(join(process.env.TRELLIS_HOME!, "superset-dedupe-")), {
		projects: [{ id: "sp-web", name: "web", repo: "https://github.com/acme/web", path: "/src/web" }],
	});
	runner = createSupersetRunner({ bin: stub.bin, url: "http://127.0.0.1:4521" });
});

afterEach(() => stub.restore());

test("ensureManager keeps the recorded manager tab and closes decorated duplicates", async () => {
	const input = {
		project: "CDE",
		runnerProjectId: "sp-web",
		host: null,
		baseBranch: "main",
		claudeSessionId: null,
	};
	const first = await runner.ensureManager(input);
	stub.update((state) => {
		state.terminals[0]!.title = "◑ CDE manager";
		state.terminals.push({ ...state.terminals[0]!, terminalId: "t-new", title: "◐ CDE manager" });
	});
	const second = await runner.ensureManager({ ...input, terminalId: first.terminalId });
	expect(second).toEqual({ ...first, started: false });
	expect(stub.callsOf("terminals create")).toEqual([]);
	expect(stub.callsOf("terminals close")[0]).toEqual([
		"terminals",
		"close",
		"--workspace",
		first.workspaceId,
		"--terminal",
		"t-new",
	]);
});
