import { describe, expect, test } from "bun:test";
import type { UsageAccount } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { UsageAccountRow } from "../UsageAccountRow";
import { VirtualUsageAccountRows } from "./VirtualUsageAccountRows";

const account = (index: number): UsageAccount => ({
	key: `account:Account ${index}`,
	id: `account-${index}`,
	name: `Account ${index}`,
	harness: "codex",
	profilePath: `/profiles/${index}`,
	isDefault: index === 0,
	defaultSource: "trellis",
	loginCommand: "codex login",
	sharedWith: [],
	quota: {
		status: "unavailable",
		email: null,
		plan: null,
		detail: null,
		windows: [],
		creditsBalance: null,
		extraUsage: null,
		fetchedAt: "2026-09-29T06:00:00.000Z",
	},
});

describe("VirtualUsageAccountRows", () => {
	test("bounds the initial render of 300 accounts", () => {
		const accounts = Array.from({ length: 300 }, (_value, index) => account(index));
		const html = renderToStaticMarkup(
			<VirtualUsageAccountRows
				accounts={accounts}
				renderRow={(item, onActiveChange) => (
					<UsageAccountRow
						account={item}
						metric="usd"
						total={0}
						pending={false}
						busy={false}
						refreshing={false}
						onDefault={() => {}}
						onRename={() => {}}
						onRemove={() => {}}
						onRefresh={() => {}}
						onActiveChange={onActiveChange}
					/>
				)}
			/>,
		);
		expect(html.match(/data-usage-account=/g)).toHaveLength(16);
		expect(html).toContain("Account 0 · Default");
		expect(html).not.toContain("Account 299");
	});
});
