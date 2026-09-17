import { expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { HarnessHost } from "../../../../../src/agents/harnessHost/harnessHost.ts";
import { workerAction } from "../../../../../src/services/manager/workerAction.ts";
import { harnessHostFixture } from "../../../../helpers/harnessHostFixture.ts";

for (const behavior of ["compaction", "compaction-stalled"] as const)
	test(`Codex ${behavior} uses observed progress for startup and worker recovery`, async () => {
		const fixture = await harnessHostFixture();
		const host = new HarnessHost({
			runtime: fixture.client,
			directory: join(fixture.home, "attempts"),
			bun: process.execPath,
			observationTimeoutMs: 5000,
			env: { ...process.env, PATH: join(fixture.home, "bin"), HARNESS_FIXTURE_BEHAVIOR: behavior },
		});
		try {
			const start = host.start({ id: "compact", harness: "codex", cwd: fixture.home, prompt: "Continue" });
			if (behavior === "compaction-stalled") {
				await expect(start).rejects.toMatchObject({ code: "HARNESS_OBSERVATION_TIMEOUT" });
				const stalled = await host.status("compact");
				expect(stalled.acknowledgedMessageIds).toEqual([]);
				expect(stalled.agent?.lastTool?.name).toBe("contextCompaction");
			} else {
				const { process: session } = await start;
				expect(session.acknowledgedMessageIds).toContain("compact");
				expect(session.agent?.lastTool?.name).toBe("contextCompaction");
				const last = Date.parse(session.agent!.lastTool!.updatedAt);
				expect(
					workerAction({ ...session, agent: { ...session.agent!, lastMessage: null } }, new Date(last + 59999)),
				).not.toBe("restart");
				expect(
					workerAction({ ...session, agent: { ...session.agent!, lastMessage: null } }, new Date(last + 60000)),
				).toBe("restart");
			}
		} finally {
			await host.stop("compact");
			const exited = new Promise<void>((done) => fixture.daemon.once("exit", () => done()));
			await fixture.client.shutdown();
			await exited;
			await rm(fixture.home, { recursive: true, force: true });
		}
	}, 20000);
