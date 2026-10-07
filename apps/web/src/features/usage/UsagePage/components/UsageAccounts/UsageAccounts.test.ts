import { describe, expect, test } from "bun:test";
import type { HarnessAccount, UsageAccount } from "@trellis/api";
import { unavailableUsageAccounts } from "./UsageAccounts";
import { usageAccountMatches } from "./usageAccountMatches";

const account: HarnessAccount = {
	id: "01M2Q0Z191Q244RDP6R3SBFKE5",
	name: "Muse work",
	harness: "muse",
	profilePath: "/tmp/muse-work",
	isDefault: true,
	loginCommand: "muse login",
	capabilities: {
		launch: true,
		resumeWithAccount: true,
		quota: true,
		detail: null,
	},
	createdAt: "2026-09-17T06:00:00.000Z",
	updatedAt: "2026-09-17T06:01:00.000Z",
};

describe("unavailableUsageAccounts", () => {
	test("keeps configured accounts when quota data is unavailable", () => {
		expect(unavailableUsageAccounts([account])).toEqual([
			{
				key: "account:Muse work",
				id: account.id,
				name: account.name,
				harness: account.harness,
				profilePath: account.profilePath,
				isDefault: true,
				defaultSource: null,
				loginCommand: account.loginCommand,
				sharedWith: [],
				quota: {
					status: "unavailable",
					email: null,
					plan: null,
					detail: null,
					windows: [],
					creditsBalance: null,
					extraUsage: null,
					fetchedAt: account.updatedAt,
				},
			},
		]);
	});
});

const usageAccount: UsageAccount = {
	...unavailableUsageAccounts([account])[0]!,
	name: "Catalog primary",
	sharedWith: ["Team workspace"],
	quota: {
		status: "ok",
		email: "avery@example.test",
		plan: "Team",
		detail: null,
		windows: [
			{
				id: "weekly",
				label: "Weekly window",
				usedPercent: 82,
				resetsAt: "2026-10-12T10:00:00.000Z",
			},
		],
		creditsBalance: null,
		extraUsage: null,
		fetchedAt: "2026-10-07T06:00:00.000Z",
	},
};

describe("usageAccountMatches", () => {
	test("matches the visible account identity without case sensitivity", () => {
		for (const query of [
			"catalog PRIMARY",
			"muse",
			"meta",
			"/tmp/muse-work",
			"default",
			"avery@example.test",
			"team",
			"weekly window",
			"82% used",
			"team workspace",
		]) {
			expect(usageAccountMatches(usageAccount, query)).toBe(true);
		}
	});

	test("matches a blank query and rejects unrelated text", () => {
		expect(usageAccountMatches(usageAccount, "   ")).toBe(true);
		expect(usageAccountMatches(usageAccount, "not-a-real-account")).toBe(false);
	});
});
