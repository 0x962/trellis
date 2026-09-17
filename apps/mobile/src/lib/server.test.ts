import { describe, expect, jest, test } from "bun:test";
import { StandardRPCJsonSerializer } from "@orpc/client/standard";
import { actorHeader, probeHealth, validateActorName, validateServerUrl } from "./server";

const actor = "human:dana";
const base = "http://192.168.1.20:4521";

// Answers the RPC procedures the probe calls, keyed by the last path segment
// of the request URL, in the RPC link's own `{ json, meta }` encoding. The
// requests are kept so a test can read a URL and its headers.
const rpcStub = (answers: Record<string, unknown>) => {
	const requests: Request[] = [];
	const serializer = new StandardRPCJsonSerializer();
	const fetch = async (request: Request) => {
		requests.push(request);
		const name = new URL(request.url).pathname.split("/").at(-1)!;
		const [json, meta] = serializer.serialize(answers[name]);
		return new Response(JSON.stringify({ json, meta }), {
			status: 200,
			headers: { "content-type": "application/json" },
		});
	};
	return { requests, fetch };
};

const health = {
	ok: true,
	version: "0.1.0",
	apiVersion: "1",
	bootId: "01J8Z6X4Q3M2K1H0G9F8E7D6B0",
	rss: 1,
	addresses: ["http://192.168.1.20:4521"],
	db: { ok: true, sizeBytes: 1 },
	gh: { ok: false, user: null, reason: null, message: null, checkedAt: null },
};
const counts = { total: 12, byStatus: [] };
const defaultActor = { name: "dana", kind: "human" };

const success = { ok: true, version: "0.1.0", apiVersion: "1", ticketCount: 12, actorName: "dana" } as const;

// Fake timers leave microtasks alone, so a few awaits settle a promise.
const settle = async () => {
	for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

describe("validateServerUrl", () => {
	test("rejects a URL without an http or https scheme and normalizes a trailing slash", () => {
		for (const input of ["192.168.1.20:4521", "trellis.localhost", "ftp://x"]) {
			const result = validateServerUrl(input);
			expect(result.ok).toBe(false);
			if (result.ok) throw new Error(`${input} validated`);
			expect(result.error).toContain("http://");
			expect(result.error).toContain("https://");
		}
		expect(validateServerUrl("http://192.168.1.20:4521/")).toEqual({ ok: true, url: "http://192.168.1.20:4521" });
	});
});

describe("validateActorName", () => {
	// The actor header grammar takes 1 to 64 printable ASCII characters
	// without a colon. `createTrellisClient` throws on anything else, so the
	// setup screen must not send it a name it rejects.
	test("rejects a name the actor header grammar rejects and trims the rest", () => {
		for (const input of ["", "   ", "dana:lee", "Zoë", "line\nbreak", "n".repeat(65)]) {
			const result = validateActorName(input);
			expect(result.ok, input).toBe(false);
			if (result.ok) throw new Error(`${input} validated`);
			expect(result.error).toContain("colon");
		}
		expect(validateActorName("  dana  ")).toEqual({ ok: true, name: "dana" });
		expect(validateActorName("n".repeat(64)).ok).toBe(true);
	});

	// The client parses the header before it builds a request. A name this
	// module accepts never reaches that throw.
	test("a name it accepts builds a client and a name it rejects throws there", async () => {
		const { fetch } = rpcStub({ health, counts, default: defaultActor });
		const accepted = validateActorName("dana lee");
		expect(accepted.ok).toBe(true);
		if (!accepted.ok) throw new Error("valid name rejected");
		expect(await probeHealth(base, actorHeader(accepted.name), { fetch })).toEqual(success);
		expect(probeHealth(base, actorHeader("dana:lee"), { fetch })).rejects.toThrow();
	});
});

describe("probeHealth", () => {
	test("the health probe times out at exactly 3 s and aborts the request", async () => {
		jest.useFakeTimers();
		try {
			const signals: AbortSignal[] = [];
			const never = (request: Request) => {
				signals.push(request.signal);
				return new Promise<Response>(() => {});
			};
			let result: unknown;
			void probeHealth(base, actor, { fetch: never }).then((value) => {
				result = value;
			});
			await settle();
			jest.advanceTimersByTime(2999);
			await settle();
			expect(result).toBeUndefined();
			jest.advanceTimersByTime(1);
			await settle();
			expect(result).toMatchObject({ ok: false, kind: "timeout" });
			expect(signals).toHaveLength(1);
			expect(signals[0]!.aborted).toBe(true);
		} finally {
			jest.useRealTimers();
		}
	});

	test("a refused connection and a non-trellis response each carry their own error kind", async () => {
		const refused = Object.assign(new TypeError("fetch failed"), {
			cause: { code: "ECONNREFUSED", message: "connect ECONNREFUSED 192.168.1.20:4521" },
		});
		const rejecting = () => Promise.reject(refused);
		expect(await probeHealth(base, actor, { fetch: rejecting })).toMatchObject({
			ok: false,
			kind: "unreachable",
			detail: expect.stringContaining("ECONNREFUSED"),
		});
		const html = async () =>
			new Response("<!doctype html><title>another app</title>", {
				status: 200,
				headers: { "content-type": "text/html" },
			});
		expect(await probeHealth(base, actor, { fetch: html })).toMatchObject({ ok: false, kind: "not-trellis" });
	});

	test("a reachable server yields version, ticket count, and actor name through the client", async () => {
		const { requests, fetch } = rpcStub({ health, counts, default: defaultActor });
		expect(await probeHealth(base, actor, { fetch })).toEqual(success);
		const request = requests.find((item) => new URL(item.url).pathname.endsWith("/health"));
		expect(request).toBeDefined();
		expect(request!.headers.get("x-trellis-actor")).toBe("human:dana");
	});
});
