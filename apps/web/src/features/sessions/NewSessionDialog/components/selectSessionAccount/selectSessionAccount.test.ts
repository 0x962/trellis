import { expect, test } from "bun:test";
import { type HarnessAccount, type HarnessAccountQuota, HarnessSchema } from "@trellis/api";
import { selectSessionAccount } from "./selectSessionAccount";

const account = (id: string, harness: HarnessAccount["harness"] = "claude", isDefault = false): HarnessAccount => ({
	id,
	name: id,
	harness,
	isDefault,
	profilePath: `/profiles/${id}`,
	loginCommand: null,
	capabilities: { launch: true, resumeWithAccount: true, quota: true, detail: null },
	createdAt: "2026-09-29T00:00:00.000Z",
	updatedAt: "2026-09-29T00:00:00.000Z",
});
const quota = (
	accountId: string,
	used: number[],
	status: HarnessAccountQuota["status"] = "ok",
): HarnessAccountQuota => ({
	accountId,
	status,
	email: null,
	plan: null,
	detail: null,
	creditsBalance: null,
	extraUsage: null,
	fetchedAt: "2026-09-29T00:00:00.000Z",
	windows: used.map((usedPercent, index) => ({ id: String(index), label: String(index), usedPercent, resetsAt: null })),
});
const accounts = [account("default", "claude", true), account("available"), account("codex", "codex")];
const choose = (quotas: HarnessAccountQuota[], accountId = "") =>
	selectSessionAccount({ harness: HarnessSchema.parse({ preset: "claude" }), accounts, quotas, accountId });

test("selects a known available account after quota arrives", () => {
	expect(choose([])).toBe("");
	expect(choose([quota("default", [100, 20])])).toBe("");
	expect(choose([quota("default", [100, 20]), quota("available", [20, 90])])).toBe("available");
});

test("does not select an exhausted or incompatible account", () => {
	expect(choose([quota("default", [20, 100]), quota("available", [101]), quota("codex", [0])])).toBe("");
});

test("keeps the existing default behavior when allowance is unknown", () => {
	for (const status of ["signed_out", "stale", "expired", "unavailable", "metered"] as const) {
		expect(choose([quota("available", [0], status)])).toBe("");
		expect(choose([quota("available", [0], status)], "default")).toBe("default");
	}
	expect(choose([quota("available", [])])).toBe("");
});

test("prefers the saved available account, then the configured default", () => {
	const quotas = [quota("default", [10]), quota("available", [20])];
	expect(choose(quotas)).toBe("default");
	expect(choose(quotas, "available")).toBe("available");
});

test("recognizes unlimited allowance but requires launch capability", () => {
	expect(choose([quota("available", [], "unlimited")])).toBe("available");
	expect(
		selectSessionAccount({
			harness: HarnessSchema.parse({ preset: "claude" }),
			accountId: "",
			quotas: [quota("available", [0])],
			accounts: [{ ...account("available"), capabilities: { ...account("available").capabilities, launch: false } }],
		}),
	).toBe("");
});

test("selects only accounts for the new harness", () => {
	expect(
		selectSessionAccount({
			harness: HarnessSchema.parse({ preset: "codex" }),
			accounts,
			accountId: "available",
			quotas: [quota("available", [0]), quota("codex", [30])],
		}),
	).toBe("codex");
	expect(
		selectSessionAccount({
			harness: HarnessSchema.parse({ preset: "codex" }),
			accounts,
			accountId: "available",
			quotas: [],
		}),
	).toBe("");
});
