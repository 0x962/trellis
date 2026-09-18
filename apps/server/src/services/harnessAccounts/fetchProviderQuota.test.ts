import { describe, expect, test } from "bun:test";
import type { HarnessAccount } from "@trellis/api";
import { type Credential, fetchAccountQuota } from "./fetchQuota.ts";

const account = (harness: HarnessAccount["harness"]) => ({
	id: "01J00000000000000000000000",
	name: harness,
	harness,
	profilePath: `/tmp/${harness}`,
	isDefault: false,
	createdAt: "2026-09-17T00:00:00.000Z",
	updatedAt: "2026-09-17T00:00:00.000Z",
});

const credential = (value: Partial<Credential> = {}): Credential => ({
	token: "token",
	email: null,
	plan: null,
	...value,
});

const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
const fetcher = (value: unknown) => (async () => response(value)) as unknown as typeof fetch;

describe("provider account quota", () => {
	test("reports providers without quota endpoints as unavailable", async () => {
		const result = await fetchAccountQuota(account("pi"), fetch, async () => credential());

		expect(result.status).toBe("unavailable");
		expect(result.detail).toBe("This provider does not expose quota windows.");
	});

	test("reserves unlimited for a Codex response without standard windows", async () => {
		const result = await fetchAccountQuota(
			account("codex"),
			fetcher({ email: "person@example.com", plan_type: "business", credits: { balance: "7.5" } }),
			async () => credential(),
		);

		expect(result.status).toBe("unlimited");
		expect(result.creditsBalance).toBe(7.5);
	});

	test("reports a Claude response without windows as unavailable", async () => {
		const result = await fetchAccountQuota(
			account("claude"),
			fetcher({ extra_usage: { used_credits: 100, monthly_limit: 500 } }),
			async () => credential(),
		);

		expect(result.status).toBe("unavailable");
		expect(result.extraUsage).toEqual({ usedCents: 100, limitCents: 500 });
	});

	test("reports API billing as metered", async () => {
		const result = await fetchAccountQuota(account("codex"), fetch, async () =>
			credential({ token: null, apiKey: true }),
		);

		expect(result.status).toBe("metered");
	});

	test("reports a Claude access token with a live refresh token as stale", async () => {
		const now = 100;
		const result = await fetchAccountQuota(
			account("claude"),
			fetch,
			async () => credential({ expiresAt: 50, refreshTokenExpiresAt: 200 }),
			now,
		);

		expect(result.status).toBe("stale");
		expect(result.detail).toBe("Refreshes when Claude Code next runs.");
	});
});
