import { expect, test } from "bun:test";
import { fireEvent, render } from "@testing-library/react";
import { NativeMigrationReview } from "./NativeMigrationReview";

const base = {
	version: "a".repeat(64),
	directory: "/tmp/repository",
	onDirectoryChange: () => {},
	agents: [
		{
			id: "old-manager",
			source: "persona",
			runtime: "superset",
			state: "interrupted",
			role: "manager",
			workspaceId: "old-workspace",
			terminalId: "old-terminal",
			conversationId: "old-chat",
		},
	],
	blockers: [{ id: "old-manager", kind: "agent", reason: "The old assignment still owns work." }],
	onRetire: () => {},
	onApply: () => {},
	processing: false,
};
test("migration identifies old owners and blocks application until ownership clears", () => {
	const view = render(<NativeMigrationReview {...base} />);
	expect(view.getByText("old-workspace")).toBeDefined();
	expect(view.getByText("old-terminal")).toBeDefined();
	expect(view.getByText("old-chat")).toBeDefined();
	expect(view.getByText("The old assignment still owns work.")).toBeDefined();
	expect((view.getByRole("button", { name: "Confirm local execution" }) as HTMLButtonElement).disabled).toBe(true);
});
test("migration requires an explicit confirmation and shows the preview version", () => {
	let applied = 0;
	const view = render(<NativeMigrationReview {...base} blockers={[]} onApply={() => applied++} />);
	expect(view.getByText(base.version)).toBeDefined();
	const button = view.getByRole("button", { name: "Confirm local execution" }) as HTMLButtonElement;
	expect(button.disabled).toBe(true);
	fireEvent.click(
		view.getByRole("checkbox", { name: "Keep automatic dispatch paused and require repository trust before launch" }),
	);
	expect(button.disabled).toBe(false);
	fireEvent.click(button);
	expect(applied).toBe(1);
});
