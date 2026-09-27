import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { evaluateHostReleasePreflight } from "@trellis/api";
import { readHostReleaseManifest, verifyHostRelease } from "./manifest/index.ts";
import { observeHost } from "./observeHost/index.ts";

const { values } = parseArgs({ options: { release: { type: "string" } } });
if (!values.release) throw new Error("--release is required");
const root = resolve(values.release);
const manifest = await readHostReleaseManifest(root);
const [verification, observation] = await Promise.all([verifyHostRelease(root), observeHost()]);
const compatibility = evaluateHostReleasePreflight(manifest.target, observation);
process.stdout.write(
	`${JSON.stringify(
		{
			schemaVersion: 1,
			ok: verification.ok && compatibility.ok,
			releaseId: manifest.releaseId,
			verification,
			compatibility,
		},
		null,
		2,
	)}\n`,
);
if (!verification.ok || !compatibility.ok) process.exitCode = 1;
