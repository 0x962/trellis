import type { FetchLike } from "@trellis/api";
import type { TestServer } from "./server/index.ts";

export type InterceptOptions = {
	// Matches a request by its URL and body text. A batch body names every
	// procedure path inside it, so `tickets/update` matches a batched call.
	match: (text: string) => boolean;
	// The response a matched request gets instead of the server's own. Without
	// it, a matched request waits until `release()`, then reaches the server.
	respond?: () => Response;
};

// A test server whose fetch holds or fails the requests `match` selects.
// `held()` counts the requests that wait.
export const interceptFetch = (server: TestServer, options: InterceptOptions) => {
	const waiting: Array<() => void> = [];
	const fetch: FetchLike = async (request, init) => {
		const text = `${request.url}\n${await request.clone().text()}`;
		if (!options.match(text)) return server.fetch(request, init);
		if (options.respond !== undefined) return options.respond();
		await new Promise<void>((resolve) => waiting.push(resolve));
		return server.fetch(request, init);
	};
	const release = () => {
		for (const resolve of waiting.splice(0)) resolve();
	};
	return { server: { ...server, fetch } as TestServer, release, held: () => waiting.length };
};

// A plain 500 with a text body. The client reports it as an unknown error.
export const serverError = () => new Response("boom", { status: 500 });
