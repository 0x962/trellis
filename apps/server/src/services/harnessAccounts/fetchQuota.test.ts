import { expect, test } from "bun:test";
import type { HarnessAccount } from "@trellis/api";

type AccountRow = Omit<HarnessAccount, "loginCommand" | "capabilities">;

import { fetchAccountQuota } from "./fetchQuota.ts";

const account: AccountRow = {
	id: "01M00000000000000000000000",
	name: "Work",
	harness: "claude",
	profilePath: "/tmp/profile",
	enabled: true,
	isDefault: false,
	createdAt: "2026-09-16T00:00:00.000Z",
	updatedAt: "2026-09-16T00:00:00.000Z",
};
const read = async () => ({ token: "secret", email: "work@example.com", plan: "max" });
const fetcher = (handler: (url: string, init: RequestInit) => Response | Promise<Response>) =>
	((url: unknown, init: RequestInit) => handler(String(url), init)) as typeof fetch;
test("Claude quota carries provider reset times without exposing its token", async () => {
	const result = await fetchAccountQuota(
		account,
		fetcher((url, init) => {
			expect(url).toBe("https://api.anthropic.com/api/oauth/usage");
			expect(new Headers(init.headers).get("authorization")).toBe("Bearer secret");
			return Response.json({
				five_hour: { utilization: 100, resets_at: "2026-09-16T15:00:00.000Z" },
				seven_day: { utilization: 40, resets_at: null },
			});
		}),
		read,
	);
	expect(result.status).toBe("ok");
	expect(result.windows[0]).toMatchObject({ usedPercent: 100, resetsAt: "2026-09-16T15:00:00.000Z" });
	expect(JSON.stringify(result)).not.toContain("secret");
});
test.each([401, 403, 429, 500])("HTTP %s remains an unknown allowance and never reports zero usage", async (status) => {
	const result = await fetchAccountQuota(
		account,
		fetcher(() => new Response("secret", { status })),
		read,
	);
	expect(result.status).toBe(status === 401 || status === 403 ? "expired" : "unavailable");
	expect(result.windows).toEqual([]);
	expect(result.detail).toContain(String(status));
	expect(JSON.stringify(result)).not.toContain("secret");
});
test("Codex uses the selected account header and maps its quota windows", async () => {
	const result = await fetchAccountQuota(
		{ ...account, harness: "codex" },
		fetcher((_url, init) => {
			expect(new Headers(init.headers).get("chatgpt-account-id")).toBe("work-account");
			return Response.json({
				email: "codex@example.com",
				plan_type: "pro",
				rate_limit: { primary_window: { used_percent: 45, reset_after_seconds: 60 } },
			});
		}),
		async () => ({ ...(await read()), accountId: "work-account" }),
		Date.parse("2026-09-16T00:00:00Z"),
	);
	expect(result).toMatchObject({
		status: "ok",
		email: "codex@example.com",
		plan: "pro",
		windows: [{ usedPercent: 45, resetsAt: "2026-09-16T00:01:00.000Z" }],
	});
});
test("unsupported quota and API billing remain explicit", async () => {
	expect((await fetchAccountQuota({ ...account, harness: "pi" }, fetch, read)).status).toBe("unsupported");
	expect((await fetchAccountQuota(account, fetch, async () => ({ ...(await read()), apiKey: true }))).status).toBe(
		"unsupported",
	);
});

test("a Muse profile reports its sign-in state and no allowance windows", async () => {
	const muse = { ...account, harness: "muse" as const };
	const signedIn = await fetchAccountQuota(
		muse,
		fetcher(() => Response.error()),
		async () => ({
			token: null,
			email: "work@example.com",
			plan: "oauth",
		}),
	);
	expect(signedIn).toMatchObject({ status: "unsupported", email: "work@example.com", windows: [] });
	expect(signedIn.detail).toContain("running session");
	const signedOut = await fetchAccountQuota(
		muse,
		fetcher(() => Response.error()),
		async () => ({
			token: null,
			email: null,
			plan: null,
		}),
	);
	expect(signedOut).toMatchObject({ status: "signed_out", email: null, windows: [] });
});
