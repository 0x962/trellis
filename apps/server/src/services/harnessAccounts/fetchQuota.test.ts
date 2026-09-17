import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessAccount } from "@trellis/api";
import { writeMuseUsage } from "../../agents/harnesses/muse/museUsage.ts";

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
test("a harness without a quota endpoint and API billing count as unlimited", async () => {
	expect((await fetchAccountQuota({ ...account, harness: "pi" }, fetch, read)).status).toBe("unlimited");
	expect((await fetchAccountQuota(account, fetch, async () => ({ ...(await read()), apiKey: true }))).status).toBe(
		"unlimited",
	);
});

test("a Muse profile shows the windows its last agent run saved, and asks for a run without them", async () => {
	const profilePath = await mkdtemp(join(tmpdir(), "trellis-muse-quota-"));
	try {
		const muse = { ...account, harness: "muse" as const, profilePath };
		const signedIn = async () => ({ token: null, email: "work@example.com", plan: "oauth" });
		const empty = await fetchAccountQuota(
			muse,
			fetcher(() => Response.error()),
			signedIn,
		);
		expect(empty).toMatchObject({ status: "unavailable", email: "work@example.com", plan: null, windows: [] });
		expect(empty.detail).toContain("Start one");
		const now = Date.UTC(2026, 8, 16, 22, 0, 0);
		await mkdir(join(profilePath, "muse"));
		await writeMuseUsage(join(profilePath, "muse"), {
			observedAtMs: now - 60_000,
			window: { usedPercent: 40, windowDurationMins: 300, resetsAtMs: now + 3600_000 },
			weekly: { usedPercent: 7, resetsAtMs: now + 86400_000 },
		});
		const filled = await fetchAccountQuota(
			muse,
			fetcher(() => Response.error()),
			signedIn,
			now,
		);
		expect(filled).toMatchObject({
			status: "ok",
			fetchedAt: new Date(now - 60_000).toISOString(),
			windows: [
				{ id: "window", label: "Session (5h)", usedPercent: 40 },
				{ id: "weekly", label: "Weekly", usedPercent: 7 },
			],
		});
		const reset = await fetchAccountQuota(
			muse,
			fetcher(() => Response.error()),
			signedIn,
			now + 2 * 86400_000,
		);
		expect(reset.status).toBe("unavailable");
		expect(reset.detail).toContain("have reset");
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
	} finally {
		await rm(profilePath, { recursive: true, force: true });
	}
});
