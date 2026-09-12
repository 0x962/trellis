import { expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { ReviewConversation } from "./ReviewConversation";

test("shows the description before GitHub comments and reviews in time order", () => {
	const { container } = render(
		<ReviewConversation
			meta={{
				body: "PR description",
				author: { login: "owner" },
				comments: [{ id: "c", body: "Later comment", createdAt: "2026-09-12T02:00:00Z", author: { login: "human" } }],
				reviews: [
					{
						id: "r",
						body: "Earlier review",
						state: "APPROVED",
						submittedAt: "2026-09-12T01:00:00Z",
						author: { login: "reviewer" },
					},
				],
			}}
			renderBody={(body) => <p>{body}</p>}
		/>,
	);
	const articles = [...container.querySelectorAll("article")];
	expect(articles.map((article) => article.querySelector("p")?.textContent)).toEqual([
		"PR description",
		"Earlier review",
		"Later comment",
	]);
});
