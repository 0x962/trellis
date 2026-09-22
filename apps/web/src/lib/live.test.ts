import { expect, test } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { createLive, type LiveStatus } from "./live";

type Listener = (event: MessageEvent) => void;

class TestSource {
	listeners = new Map<string, Listener[]>();
	addEventListener(type: string, listener: Listener) {
		this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
	}
	close() {}
	send(type: string, data: unknown, id = "") {
		for (const listener of this.listeners.get(type) ?? []) {
			listener({ data: JSON.stringify(data), lastEventId: id } as MessageEvent);
		}
	}
}

const scheduler = {
	now: () => Date.now(),
	setTimeout: (callback: () => void) => setTimeout(callback, 0),
	clearTimeout: (handle: unknown) => clearTimeout(handle as Timer),
};

const channel = () => ({
	postMessage: () => {},
	addEventListener: () => {},
	close: () => {},
});

test("a ready event after the first ready refetches active queries once", async () => {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	let calls = 0;
	const queryOptions = {
		queryKey: ["watched"],
		queryFn: () => {
			calls += 1;
			return calls;
		},
		staleTime: Number.POSITIVE_INFINITY,
	};
	const observer = new QueryObserver(queryClient, queryOptions);
	const unsubscribe = observer.subscribe(() => {});
	await observer.refetch();
	let source: TestSource | null = null;
	const live = createLive({
		queryClient,
		locks: { request: async (_name, callback) => callback({}) },
		createChannel: channel,
		EventSource: class extends TestSource {
			constructor(_url: string) {
				super();
				source = this;
			}
		},
		scheduler,
		applyEvent: () => {},
	});

	live.start();
	source!.send("ready", { bootId: "one" });
	source!.send("ready", { bootId: "one" });
	await Bun.sleep(1);

	expect(calls).toBe(2);
	expect(live.status.get() satisfies LiveStatus).toBe("live");
	unsubscribe();
	await live.stop();
});
