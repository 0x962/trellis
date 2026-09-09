import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Every test run gets its own empty data home. A test that writes under
// TRELLIS_HOME never touches ~/.trellis, and two runs never share a file.
const home = mkdtempSync(join(tmpdir(), "trellis-test-"));
process.env.TRELLIS_HOME = home;
process.on("exit", () => rmSync(home, { recursive: true }));
