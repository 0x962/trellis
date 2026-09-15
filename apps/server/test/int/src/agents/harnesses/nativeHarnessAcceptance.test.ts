import { expect, test } from "bun:test";
import type { HarnessEvent } from "../../../../../src/agents/harnesses/types.ts";
import { createNativeHarnessAcceptance } from "../../../../nativeHarnessAcceptance.ts";

test("native acceptance fixture captures callbacks and bytes across separate PTYs", async () => {
	const fixture = await createNativeHarnessAcceptance({
		name: "fixture",
		parse: (payload) => [payload as HarnessEvent],
	});
	try {
		const launch = {
			executable: "/bin/sh",
			args: [
				"-c",
				`printf 'PTY_READY'; printf '%s' '{"kind":"session","sessionId":"fixture"}' | ${fixture.hookCommand}; exec /bin/cat`,
			],
			env: {},
		};
		const first = await fixture.start(launch, fixture.directory);
		expect(first.pid).toBeGreaterThan(0);
		expect(await fixture.waitFor((event) => event.kind === "session")).toMatchObject({ sessionId: "fixture" });
		await fixture.stop();
		expect(fixture.output).toContain("PTY_READY");
		const after = fixture.events.length;
		const second = await fixture.start(launch, fixture.directory);
		expect(second.pid).not.toBe(first.pid);
		await fixture.waitFor((event) => event.kind === "session", { after });
		await fixture.stop();
		expect(fixture.events).toHaveLength(2);
	} finally {
		await fixture.dispose();
	}
});
