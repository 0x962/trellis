import { marginOrigin } from "../src/features/prs/utils/marginUrl";

// A test reaches no network, and margin runs on another origin. These
// helpers answer the request that MarginFrame sends to margin, and they
// record every such request. `restoreMargin` puts the real fetch back, so a
// later test in the same file reaches the fake server again.

export type MarginRequest = { url: string; mode: string | undefined };

const realFetch = globalThis.fetch;

const stub = (reply: () => Promise<Response>) => {
	const calls: MarginRequest[] = [];
	globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
		const url = input instanceof Request ? input.url : String(input);
		if (!url.startsWith(marginOrigin)) return realFetch(input as RequestInfo, init);
		calls.push({ url, mode: init?.mode });
		return reply();
	}) as typeof globalThis.fetch;
	return calls;
};

// margin answers, so the frame gets the page.
export const marginUp = () => stub(async () => new Response(null, { status: 200 }));

// Nothing listens on margin's port, so the request fails the way a browser
// fails one: it rejects, and it carries no status.
export const marginDown = () =>
	stub(async () => {
		throw new TypeError("Failed to fetch");
	});

// margin answers no request in this test, so the reachability question stays
// open for as long as the test needs.
export const marginSilent = () => stub(() => new Promise<Response>(() => {}));

export const restoreMargin = () => {
	globalThis.fetch = realFetch;
};
