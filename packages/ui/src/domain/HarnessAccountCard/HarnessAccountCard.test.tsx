import { expect, test } from "bun:test";
import { fireEvent, render } from "@testing-library/react";
import { HarnessAccountCard } from "./HarnessAccountCard";

const account = {
	id: "one",
	name: "Work",
	harness: "claude",
	profilePath: "/tmp/work",
	isDefault: false,
	enabled: true,
	loginCommand: "CLAUDE_CONFIG_DIR='/tmp/work' claude auth login",
};
test("unavailable quota remains unknown and the account exposes its sign-in command", async () => {
	let refreshes = 0;
	const view = render(
		<HarnessAccountCard
			account={account}
			quota={{
				status: "unavailable",
				email: null,
				plan: null,
				detail: "Quota request failed (HTTP 429).",
				fetchedAt: "2026-09-16T12:00:00Z",
				windows: [],
			}}
			busy={false}
			refreshing={false}
			onDefault={() => {}}
			onEnabled={() => {}}
			onRemove={() => {}}
			onRefresh={() => refreshes++}
			onCopy={() => {}}
		/>,
	);
	expect(view.getByText("Quota unavailable")).toBeDefined();
	expect(view.getByText("Quota request failed (HTTP 429).")).toBeDefined();
	expect(view.queryByRole("meter")).toBeNull();
	fireEvent.click(view.getByRole("button", { name: "Sign in to Work" }));
	expect(await view.findByText(account.loginCommand)).toBeDefined();
	fireEvent.click(view.getByRole("button", { name: "Done" }));
	expect(refreshes).toBe(1);
});
test("an exhausted quota window shows usage and reset time", () => {
	const view = render(
		<HarnessAccountCard
			account={account}
			quota={{
				status: "ok",
				email: "work@example.com",
				plan: "max",
				detail: null,
				fetchedAt: "2026-09-16T12:00:00Z",
				windows: [{ id: "weekly", label: "Weekly", usedPercent: 100, resetsAt: "2026-09-20T12:00:00Z" }],
			}}
			busy={false}
			refreshing={false}
			onDefault={() => {}}
			onEnabled={() => {}}
			onRemove={() => {}}
			onRefresh={() => {}}
			onCopy={() => {}}
		/>,
	);
	expect(view.getByRole("meter", { name: "Work: Weekly" }).getAttribute("value")).toBe("100");
	expect(view.getByText("100% used")).toBeDefined();
	expect(view.getByText(/^Resets/)).toBeDefined();
});
