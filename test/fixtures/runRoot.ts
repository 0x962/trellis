import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// test/run-root.test.ts and test/home-guard.test.ts run this file in a nested
// `bun test`. It prints the run root that its preload made. The mode comes
// from TRELLIS_ROOT_FIXTURE:
//   pass   the test passes at once
//   hang   the test waits, so the parent can send a signal to the run
//   write  the test writes a plist under TRELLIS_TEST_GUARD_HOME, and the
//          preload must fail the run
const mode = process.env.TRELLIS_ROOT_FIXTURE;

test.if(mode !== undefined)(
	"prints the run root",
	async () => {
		process.stdout.write(`ROOT=${process.env.TRELLIS_TEST_ROOT}\n`);
		if (mode === "hang") await Bun.sleep(60_000);
		if (mode === "write") {
			const plist = join(process.env.TRELLIS_TEST_GUARD_HOME!, "Library", "LaunchAgents", "com.trellis.server.plist");
			mkdirSync(dirname(plist), { recursive: true });
			writeFileSync(plist, "<plist/>\n");
		}
		expect(mode).toBeString();
	},
	120_000,
);
