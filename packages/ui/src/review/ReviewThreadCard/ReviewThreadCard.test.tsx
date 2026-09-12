import { expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReviewThreadCard } from "./ReviewThreadCard";

test("posts a reply and keeps the root resolution action accessible", async () => {
	const reply = mock(async () => {});
	render(
		<ReviewThreadCard
			thread={{
				id: "a",
				author: "Reviewer",
				kind: "agent",
				session: null,
				body: "Check the branch",
				createdAt: "2026-09-12",
				version: 1,
				reactions: [],
				replies: [],
				status: "open",
				resolvedBy: null,
			}}
			renderBody={(body) => body}
			onReply={reply}
			onResolve={async () => {}}
			onEdit={async () => {}}
			onReaction={async () => {}}
		/>,
	);
	await userEvent.type(screen.getByRole("textbox", { name: "Reply" }), "Fixed");
	await userEvent.click(screen.getByRole("button", { name: "Post reply" }));
	expect(reply).toHaveBeenCalledWith("Fixed");
	expect(document.activeElement === screen.getByRole("textbox", { name: "Reply" })).toBe(true);
	expect(screen.getByRole("button", { name: "Resolve thread" })).toBeDefined();
});
