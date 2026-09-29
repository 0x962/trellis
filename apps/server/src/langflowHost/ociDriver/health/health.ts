import { isDeepStrictEqual } from "node:util";
import type { LangflowSidecarManifestV1 } from "../../../../../../integrations/langflow/package-probe/sidecarManifest";
import type { SidecarIdentity } from "../../contracts";
import { HealthSchema } from "../identity/identity";

export async function authenticatedHealth(input: {
	fetcher(input: string | URL | Request, init?: RequestInit): Promise<Response>;
	origin: string;
	manifest: LangflowSidecarManifestV1;
	token: string;
	identity: SidecarIdentity;
	challenge: string;
}): Promise<"healthy" | "unhealthy" | "unknown"> {
	const origin = new URL(input.origin);
	if (origin.protocol !== `${input.manifest.health.scheme}:` || origin.hostname !== input.manifest.health.host) {
		throw new Error("sidecar_health_origin_conflict");
	}
	const url = new URL(input.manifest.health.path, origin);
	url.searchParams.set("challenge", input.challenge);
	let response: Response;
	try {
		response = await input.fetcher(url, {
			headers: {
				Authorization: `Bearer ${input.token}`,
				"Cache-Control": "no-store",
				"X-Trellis-Challenge": input.challenge,
			},
			redirect: "error",
			signal: AbortSignal.timeout(input.manifest.health.requestTimeoutMs),
		});
	} catch {
		return "unknown";
	}
	let health: ReturnType<typeof HealthSchema.safeParse>;
	try {
		health = HealthSchema.safeParse(await response.json());
	} catch {
		return "unhealthy";
	}
	return response.status === input.manifest.health.expectedStatus &&
		health.success &&
		health.data.challenge === input.challenge &&
		isDeepStrictEqual(health.data.identity, input.identity)
		? "healthy"
		: "unhealthy";
}
