import { afterAll, beforeAll, expect, test } from "bun:test";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReviewOverview, ReviewRevision, TrellisClient } from "@trellis/api";
import { act } from "react";
import { createRoot } from "test-renderer";
import { type AppContext, AppProvider } from "../../../../../lib/appContext";
import { useReviewData } from "./useReviewData";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const priorWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
beforeAll(() => Object.defineProperty(globalThis, "window", { configurable: true, value: new EventTarget() }));
afterAll(() => {
	if (priorWindow) Object.defineProperty(globalThis, "window", priorWindow);
	else Reflect.deleteProperty(globalThis, "window");
});

const saved: ReviewOverview = {
	pullRequest: {
		id: "01M3REXTJET8FAX3JCRJ9SAJ1S",
		owner: "acme",
		repo: "app",
		number: 1,
		url: "https://github.com/acme/app/pull/1",
		title: "Saved title",
		state: "open",
		isDraft: false,
		isQueued: false,
		localState: "ready",
		localVerdict: null,
		additions: 1,
		deletions: 0,
		changedFiles: 1,
		reviewGaps: [],
		readyForReviewAt: null,
		headRef: "fix",
		baseRef: "main",
		mergeable: "mergeable",
		reviewState: "none",
		mergedAt: null,
		closedAt: null,
		checks: [],
		ciState: "none",
		fetchError: null,
		fetchedAt: "2026-09-30T00:00:00Z",
		createdAt: "2026-09-30T00:00:00Z",
		updatedAt: "2026-09-30T00:00:00Z",
	},
	ticket: { identifier: "TST-1", title: "Fast review" },
	summary: {
		pullRequestId: "01M3REXTJET8FAX3JCRJ9SAJ1S",
		headSha: "head",
		headline: "Saved summary",
		why: "Read the saved overview.",
		watch: "nothing",
	},
	evidence: {
		pullRequestId: "01M3REXTJET8FAX3JCRJ9SAJ1S",
		headSha: "head",
		body: "Saved evidence",
		actor: { name: "Test", kind: "human" },
		createdAt: "2026-09-30T00:00:00Z",
		updatedAt: "2026-09-30T00:00:00Z",
	},
};

const tick = async () => {
	await new Promise((resolve) => setTimeout(resolve, 0));
};

async function mount(read: (pr: string) => Promise<ReviewOverview | null>) {
	let finishStatus!: (status: { headRefOid: string; baseRefOid: string; title: string }) => void;
	const remote = new Promise((resolve) => {
		finishStatus = resolve;
	});
	let finishRefresh!: (revision: ReviewRevision) => void;
	const refresh = new Promise<ReviewRevision>((resolve) => {
		finishRefresh = resolve;
	});
	const calls: string[] = [];
	const client = {
		reviews: {
			overview: async ({ pr }: { pr: string }) => {
				calls.push(`overview:${pr}`);
				return read(pr);
			},
			revision: async () => null,
			status: () => remote,
			refresh: () => {
				calls.push("refresh");
				return refresh;
			},
			metadata: async () => ({}),
			submissions: async () => [],
			list: async () => ({ items: [], total: 0, open: 0 }),
		},
		agentRuns: {
			list: async () => {
				calls.push("runs");
				return { items: [] };
			},
		},
	} as unknown as TrellisClient;
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
	const orpc = createTanstackQueryUtils(client);
	const app = { queryClient, orpc, client } as AppContext;
	let current!: ReturnType<typeof useReviewData>;
	function Probe({ pr }: { pr: string }) {
		current = useReviewData(pr);
		return null;
	}
	const root = createRoot();
	const render = async (pr: string) => {
		await act(async () => {
			root.render(
				<QueryClientProvider client={queryClient}>
					<AppProvider value={app}>
						<Probe pr={pr} />
					</AppProvider>
				</QueryClientProvider>,
			);
		});
		await act(tick);
		await act(tick);
	};
	await render("acme/app#1");
	return {
		data: () => current,
		render,
		calls,
		finishStatus,
		finishRefresh,
		close: async () => {
			await act(async () => root.unmount());
			queryClient.clear();
		},
	};
}

test("saved title, ticket, summary, and evidence load while GitHub and the first patch wait", async () => {
	const h = await mount(async () => saved);
	try {
		expect(h.data().overview.isSuccess).toBe(true);
		expect(h.data().overview.data?.summary?.headline).toBe("Saved summary");
		expect(h.data().overview.data?.evidence?.body).toBe("Saved evidence");
		expect(h.data().identity?.title).toBe("Saved title");
		expect(h.data().ticket?.identifier).toBe("TST-1");
		expect(h.data().revision).toBeNull();
		expect(h.data().status.isPending).toBe(true);
		expect(h.calls).toContain("refresh");
		expect(h.calls).toContain("runs");
		await act(async () => {
			h.finishStatus({ title: "Current GitHub title", headRefOid: "head", baseRefOid: "base" });
			await tick();
		});
		expect(h.data().identity?.title).toBe("Current GitHub title");
		expect(h.data().overview.data?.summary?.headline).toBe("Saved summary");
	} finally {
		await h.close();
	}
});

test("a failed local read stays an error and can load on explicit retry", async () => {
	let fail = true;
	const h = await mount(async () => {
		if (fail) throw new Error("Local read failed");
		return saved;
	});
	try {
		expect(h.data().overview.isSuccess).toBe(false);
		expect(h.data().overview.error?.message).toBe("Local read failed");
		fail = false;
		await act(async () => {
			await h.data().overview.refetch();
			await tick();
		});
		expect(h.data().overview.data?.summary?.headline).toBe("Saved summary");
	} finally {
		await h.close();
	}
});

test("a different pull request cannot display the preceding saved overview", async () => {
	const h = await mount(async (pr) => (pr === "acme/app#1" ? saved : null));
	try {
		await h.render("acme/app#2");
		expect(h.data().overview.data).toBeNull();
		expect(h.data().linkedPr).toBeNull();
		expect(h.data().ticket).toBeNull();
		expect(h.data().identity).toBeUndefined();
	} finally {
		await h.close();
	}
});

test("a first GitHub refresh invalidates an overview that has no stored pull request", async () => {
	let result: ReviewOverview | null = null;
	const h = await mount(async () => result);
	try {
		expect(h.data().overview.data).toBeNull();
		result = saved;
		await act(async () => {
			h.finishRefresh({
				id: "revision",
				prId: saved.pullRequest.id,
				headSha: "head",
				baseSha: "base",
				patch: "",
				meta: {},
				fetchedAt: "2026-09-30T00:00:00Z",
			});
			await tick();
		});
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 20));
		});
		expect(h.data().overview.data?.pullRequest.title).toBe("Saved title");
	} finally {
		await h.close();
	}
});
