import { readFile } from "node:fs/promises";
import { z } from "zod";

const CompatibilitySchema = z.strictObject({
	sourceDataHomeId: z.uuid(),
	sourceHostId: z.uuid(),
	enginePackageDigest: z.string().regex(/^[a-f0-9]{64}$/),
	engineDatabaseVersion: z.string().min(1),
	revisions: z.array(z.string().min(1)).min(1),
	secretVersion: z.string().regex(/^[a-f0-9]{64}$/),
});

export async function readEngineCompatibility(input: {
	endpoint: string;
	authenticationFile: string;
	signal: AbortSignal;
}) {
	const endpoint = new URL(input.endpoint);
	if (endpoint.protocol !== "http:" || endpoint.hostname !== "127.0.0.1" || endpoint.username || endpoint.password)
		throw new Error("engine_snapshot_private_endpoint_required");
	const token = await readFile(input.authenticationFile, "utf8");
	const response = await fetch(new URL("/trellis-v1/snapshots/compatibility", endpoint), {
		headers: { Authorization: `Bearer ${token}` },
		redirect: "error",
		signal: input.signal,
	});
	if (!response.ok) throw new Error("engine_snapshot_compatibility_unavailable");
	const result = CompatibilitySchema.parse(await response.json());
	if (result.revisions.join(",") !== result.engineDatabaseVersion)
		throw new Error("engine_snapshot_compatibility_conflict");
	return result;
}
