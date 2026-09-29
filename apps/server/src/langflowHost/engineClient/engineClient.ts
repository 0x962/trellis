import { readFile } from "node:fs/promises";

export type EngineRequest = {
	method: "GET" | "POST";
	path: `/trellis-v1${string}`;
	body?: string;
	capabilityId?: string;
	signal: AbortSignal;
};

export type EngineResponse =
	| { state: "received"; status: number; contentType: string | null; bytes: Uint8Array }
	| { state: "unknown" };

export type EngineFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type EngineClientDependencies = {
	fetch: EngineFetch;
	readAuthenticationFile(path: string): Promise<string>;
};

export type EngineClientOptions = {
	endpoint: string;
	authenticationFile: string;
	dependencies?: Partial<EngineClientDependencies>;
};

export type RecoveredMutation<T> =
	| { state: "resolved"; value: T; source: "lookup" | "mutation" | "recovery" }
	| { state: "absent" | "unknown" };

export function createEngineClient(options: EngineClientOptions) {
	const endpoint = new URL(options.endpoint);
	if (
		endpoint.protocol !== "http:" ||
		endpoint.hostname !== "127.0.0.1" ||
		endpoint.username ||
		endpoint.password ||
		endpoint.pathname !== "/" ||
		endpoint.search ||
		endpoint.hash
	)
		throw new Error("sidecar_endpoint_not_private");
	const fetcher = options.dependencies?.fetch ?? fetch;
	const readToken = options.dependencies?.readAuthenticationFile ?? ((path: string) => readFile(path, "utf8"));

	async function request(input: EngineRequest): Promise<EngineResponse> {
		const token = await readToken(options.authenticationFile);
		const headers = new Headers({
			Authorization: `Bearer ${token}`,
			Accept: "application/json",
			"Cache-Control": "no-store",
		});
		if (input.body !== undefined) headers.set("Content-Type", "application/json");
		if (input.capabilityId !== undefined) headers.set("X-Trellis-Capability-Id", input.capabilityId);
		let response: Response;
		try {
			response = await fetcher(new URL(input.path, endpoint), {
				method: input.method,
				headers,
				body: input.body,
				redirect: "error",
				signal: input.signal,
			});
		} catch {
			return { state: "unknown" };
		}
		return {
			state: "received",
			status: response.status,
			contentType: response.headers.get("Content-Type"),
			bytes: new Uint8Array(await response.arrayBuffer()),
		};
	}

	async function recoverMutation<T>(input: {
		lookup(): Promise<{ state: "resolved"; value: T } | { state: "absent" | "unknown" }>;
		mutate(): Promise<{ state: "resolved"; value: T } | { state: "unknown" }>;
	}): Promise<RecoveredMutation<T>> {
		const prior = await input.lookup();
		if (prior.state === "resolved") return { ...prior, source: "lookup" };
		if (prior.state === "unknown") return prior;
		const mutation = await input.mutate();
		if (mutation.state === "resolved") return { ...mutation, source: "mutation" };
		const recovered = await input.lookup();
		if (recovered.state === "resolved") return { ...recovered, source: "recovery" };
		return recovered;
	}

	return { request, recoverMutation };
}
