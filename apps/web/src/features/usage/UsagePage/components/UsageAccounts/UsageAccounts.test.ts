import { describe, expect, test } from "bun:test";
import type { HarnessAccount } from "@trellis/api";
import { unavailableUsageAccounts } from "./UsageAccounts";

const account: HarnessAccount = {
	id: "01M2Q0Z191Q244RDP6R3SBFKE5",
	name: "Muse work",
	harness: "muse",
	profilePath: "/tmp/muse-work",
	isDefault: true,
	enabled: true,
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
					fetchedAt: account.updatedAt,
				},
			},
		]);
	});
});
