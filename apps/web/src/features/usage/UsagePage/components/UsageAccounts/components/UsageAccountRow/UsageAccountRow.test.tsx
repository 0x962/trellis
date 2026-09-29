import { describe, expect, test } from "bun:test";
import type { HarnessAccount, UsageAccount, UsageGroupRow } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { accountQuotaSummary, UsageAccountRow } from "./UsageAccountRow";

const account: UsageAccount = {
	key: "account:Work",
	id: "01M2Q0Z191Q244RDP6R3SBFKE5",
	name: "Work",
	harness: "claude",
	profilePath: "/Users/example/.claude-work",
	isDefault: true,
	defaultSource: "trellis",
	loginCommand: "CLAUDE_CONFIG_DIR=/Users/example/.claude-work claude auth login",
	sharedWith: [],
	quota: {
		status: "ok",
		email: "person@example.com",
		plan: "Max",
		detail: null,
		windows: [
			{ id: "five-hour", label: "Five-hour window", usedPercent: 42, resetsAt: "2026-09-29T08:00:00.000Z" },
			{ id: "weekly", label: "Weekly window", usedPercent: 71.6, resetsAt: "2026-10-05T08:00:00.000Z" },
		],
		creditsBalance: null,
		extraUsage: null,
		fetchedAt: "2026-09-29T06:00:00.000Z",
	},
};

const managed: HarnessAccount = {
	id: account.id!,
	name: account.name,
	harness: account.harness,
	profilePath: account.profilePath,
	isDefault: account.isDefault,
	loginCommand: account.loginCommand,
	capabilities: { launch: true, resumeWithAccount: true, quota: true, detail: null },
	createdAt: "2026-09-29T05:00:00.000Z",
	updatedAt: "2026-09-29T06:00:00.000Z",
};

const row: UsageGroupRow = {
	key: account.key,
	label: account.name,
	detail: null,
	href: null,
	harness: account.harness,
	usd: 96,
	tokens: 1_200_000,
	sessions: 4,
	runs: 4,
	approximate: false,
	days: [],
};

const render = (patch: Partial<React.ComponentProps<typeof UsageAccountRow>> = {}) =>
	renderToStaticMarkup(
		<UsageAccountRow
			account={account}
			managed={managed}
			row={row}
			metric="usd"
			total={240}
			pending={false}
			busy={false}
			refreshing={false}
			onDefault={() => {}}
			onRename={() => {}}
			onRemove={() => {}}
			onRefresh={() => {}}
			{...patch}
		/>,
	);

describe("UsageAccountRow", () => {
	test("shows the compact identity, quota, report value, and two row actions", () => {
		const html = render();
		expect(html).toContain("Work · Default");
		expect(html).toContain("Claude Code · 72% used");
		expect(html).toContain("$96.00");
		expect(html).toContain('aria-label="Refresh quota for Work"');
		expect(html).toContain('aria-label="Actions for Work"');
		expect(html).not.toContain(account.profilePath);
	});

	test("keeps quota availability clear for accounts without quota data", () => {
		expect(accountQuotaSummary({ ...account, quota: { ...account.quota, status: "unavailable", windows: [] } })).toBe(
			"Quota unavailable",
		);
	});
});
