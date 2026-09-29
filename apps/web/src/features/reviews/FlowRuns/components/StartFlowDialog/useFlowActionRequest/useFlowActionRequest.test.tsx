import { expect, test } from "bun:test";
import { ORPCError } from "@orpc/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "test-renderer";
import { type AppContext, AppProvider } from "../../../../../../lib/appContext";
import { useFlowActionRequest } from "./useFlowActionRequest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function fixture(send: (input: string) => Promise<string>) {
	const queryClient = new QueryClient();
	const app = { queryClient, orpc: { flowExecutions: { list: { key: () => ["runs"] } } } } as unknown as AppContext;
	let action: ReturnType<typeof useFlowActionRequest<string, string>>;
	const Probe = ({ target }: { target: string }) => {
		action = useFlowActionRequest([target], send);
		return null;
	};
	const root = createRoot();
	const mount = async (target = "first") =>
		act(async () => {
			root.render(
				<QueryClientProvider client={queryClient}>
					<AppProvider value={app}>
						<Probe target={target} />
					</AppProvider>
				</QueryClientProvider>,
			);
		});
	await mount();
	return {
		queryClient,
		action: () => action!,
		mount,
		detach: () =>
			act(async () => {
				root.render(<div />);
			}),
		close: async () => {
			await act(async () => root.unmount());
			queryClient.clear();
		},
	};
}

const flush = () =>
	act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 5));
	});

test("duplicate starts and a reopened pending dialog keep one request", async () => {
	let calls = 0;
	let resolve!: (result: string) => void;
	const f = await fixture(async () => {
		calls += 1;
		return new Promise<string>((done) => {
			resolve = done;
		});
	});
	await act(async () => {
		f.action().submit("original UUID");
		f.action().submit("another UUID");
	});
	expect(calls).toBe(1);
	await f.detach();
	await f.mount();
	expect(f.action().request?.phase).toBe("pending");
	await act(async () => f.action().submit("third UUID"));
	expect(calls).toBe(1);
	await act(async () => resolve("existing execution"));
	await flush();
	expect(f.action().request?.result).toBe("existing execution");
	await f.close();
});

test("lost acknowledgement preserves the full notes and blocks a second decision", async () => {
	let calls = 0;
	const notes = "n".repeat(200_001);
	const f = await fixture(async () => {
		calls += 1;
		throw new Error("Response lost");
	});
	await act(async () => f.action().submit(notes));
	await flush();
	await f.detach();
	await f.mount();
	expect(f.action().request?.phase).toBe("unknown");
	expect(f.action().request?.input).toBe(notes);
	await act(async () => {
		f.action().clearConflict();
		f.action().submit("reject");
	});
	expect(calls).toBe(1);
	await f.close();
});

test("a generic conflict never confirms delivery", async () => {
	const f = await fixture(async () => {
		throw new ORPCError("CONFLICT");
	});
	await act(async () => f.action().submit("approve"));
	await flush();
	expect(f.action().request?.phase).toBe("unknown");
	expect(f.action().request?.result).toBeUndefined();
	await f.close();
});

test("an explicit revision conflict requires a refreshed confirmation", async () => {
	let calls = 0;
	const f = await fixture(async (input) => {
		calls += 1;
		if (calls === 1) throw new ORPCError("FLOW_VERSION_CONFLICT");
		return input;
	});
	await act(async () => f.action().submit("revision 8"));
	await flush();
	expect(f.action().request?.phase).toBe("conflict");
	await act(async () => f.action().submit("revision 9"));
	expect(calls).toBe(1);
	await act(async () => {
		f.action().clearConflict();
		f.action().submit("revision 9");
	});
	await flush();
	expect(calls).toBe(2);
	expect(f.action().request?.result).toBe("revision 9");
	await f.close();
});

test("a late receipt stays with the request target after the component changes target", async () => {
	let resolve!: (result: string) => void;
	const f = await fixture(
		async () =>
			new Promise<string>((done) => {
				resolve = done;
			}),
	);
	await act(async () => f.action().submit("first request"));
	await f.mount("second");
	await act(async () => resolve("first receipt"));
	await flush();
	expect(f.action().request).toBeNull();
	await f.mount("first");
	expect(f.action().request?.result).toBe("first receipt");
	await f.close();
});
