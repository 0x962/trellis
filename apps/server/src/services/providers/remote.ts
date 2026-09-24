import type { IoCtx } from "../support.ts";

export type ProviderFetch = (url: string, init: RequestInit) => Promise<Response>;
export type RemoteDeps = { fetch: ProviderFetch; now: () => number };
type Endpoint = { baseUrl: string; path: string; apiKey?: string };
type Result<T> = { ok: true; value: T } | { ok: false; detail: string };

const statusDetail = (status: number): string => {
	if (status === 401) return "The provider refused the key.";
	if (status === 403) return "The provider refused the request.";
	return `The provider answered HTTP ${status}.`;
};

export const readRemote = async <T>(
	ctx: IoCtx,
	endpoint: Endpoint,
	parse: (body: unknown) => T,
	fetcher: ProviderFetch,
): Promise<Result<T>> => {
	const host = new URL(endpoint.baseUrl).host;
	const unreachable = { ok: false as const, detail: `Trellis cannot reach ${host}.` };
	try {
		const response = await fetcher(`${endpoint.baseUrl}/v1/${endpoint.path}`, {
			method: "GET",
			headers: endpoint.apiKey === undefined ? {} : { Authorization: `Bearer ${endpoint.apiKey}` },
			signal: AbortSignal.timeout(10_000),
			redirect: "manual",
		});
		ctx.log("provider.remote", { host, status: response.status });
		if (response.status !== 200) {
			await response.body?.cancel();
			return { ok: false, detail: statusDetail(response.status) };
		}
		const value = parse(await response.json());
		if (endpoint.apiKey !== undefined && JSON.stringify(value).includes(JSON.stringify(endpoint.apiKey).slice(1, -1)))
			return unreachable;
		return { ok: true, value };
	} catch {
		return unreachable;
	}
};
