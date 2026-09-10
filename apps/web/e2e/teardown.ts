import { rmSync } from "node:fs";

// Removes the temp root the config made: the server's data home and the gh
// stub files. Each run gets a new root, so a kept root is only disk use.
export default function teardown() {
	rmSync(process.env.TRELLIS_E2E_ROOT!, { recursive: true, force: true });
}
