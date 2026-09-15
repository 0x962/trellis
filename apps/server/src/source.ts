import { resolve } from "node:path";
import type { ServerSource } from "@trellis/api";

// The root of the checkout that holds this file, three directories above
// apps/server/src.
const ROOT = resolve(import.meta.dir, "../../..");

// Bun loads the code at boot, so a later commit in the checkout does not
// change the code that runs. The commit is read once, when the server starts.
export const serverSource = (checkout = ROOT): ServerSource => {
	const head = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: checkout, stdout: "pipe", stderr: "ignore" });
	return { checkout, commit: head.success ? head.stdout.toString().trim() : null };
};
