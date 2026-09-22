import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { type GitHubConversationItem, ReviewConversation } from "./ReviewConversation";

const item = (fields: Partial<GitHubConversationItem> = {}): GitHubConversationItem => ({
	id: "comment-1",
	kind: "comment",
	author: { login: "navid", avatarUrl: "https://example.com/avatar.png" },
	body: "Looks good.",
	state: null,
	path: null,
	line: null,
	side: null,
	url: null,
	isBot: false,
	createdAt: "2026-09-21T10:00:00.000Z",
	updatedAt: null,
	...fields,
});

test("prints GitHub comments with avatar, author and rendered body", () => {
	const html = renderToStaticMarkup(
		<ReviewConversation
			meta={{ body: "PR body.", author: { login: "agent" } }}
			items={[item()]}
			renderBody={(body) => <p>{body}</p>}
		/>,
	);

	expect(html).toContain("https://example.com/avatar.png");
	expect(html).toContain("navid");
	expect(html).toContain("<p>Looks good.</p>");
});

test("prints the review state and the line link", () => {
	const html = renderToStaticMarkup(
		<ReviewConversation
			meta={{ body: "PR body.", author: { login: "agent" } }}
			items={[
				item({
					kind: "line",
					state: "CHANGES_REQUESTED",
					path: "apps/web/src/App.tsx",
					line: 42,
					side: "new",
				}),
			]}
			renderBody={(body) => <p>{body}</p>}
			onLineComment={() => undefined}
		/>,
	);

	expect(html).toContain("Changes requested");
	expect(html).toContain("apps/web/src/App.tsx:42");
});

test("collapses bot comments", () => {
	const html = renderToStaticMarkup(
		<ReviewConversation
			meta={{ body: "PR body.", author: { login: "agent" } }}
			items={[item({ author: { login: "ci[bot]", avatarUrl: null }, isBot: true })]}
			renderBody={(body) => <p>{body}</p>}
		/>,
	);

	expect(html).toContain("<details");
	expect(html).toContain("Show bot comment");
	expect(html).toContain("<p>Looks good.</p>");
});
