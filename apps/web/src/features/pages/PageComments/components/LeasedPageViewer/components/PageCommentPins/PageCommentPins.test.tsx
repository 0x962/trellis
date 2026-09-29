import { expect, test } from "bun:test";
import type { PageCommentThread } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { PageCommentPins } from "./PageCommentPins";

const thread = (index: number): PageCommentThread => {
	const id = `01M3D5Q1S0KXJ0BVEHD${index.toString().padStart(6, "0")}`;
	return {
		id,
		pageId: "01M3A9CAWQNFQG4H7BJC0MMA3V",
		version: 1,
		anchor: { kind: "element", path: "main" },
		selectedText: null,
		creator: { kind: "human", name: "Navid" },
		resolved: null,
		comments: [
			{
				id: `${id.slice(0, -1)}A`,
				threadId: id,
				body: "Comment",
				actor: { kind: "human", name: "Navid" },
				createdAt: "2026-09-25T20:00:00.000Z",
				updatedAt: "2026-09-25T20:00:00.000Z",
				deletedAt: null,
			},
		],
		createdAt: "2026-09-25T20:00:00.000Z",
		updatedAt: "2026-09-25T20:00:00.000Z",
	};
};

test("renders more than 200 visible pins before any selection", () => {
	const comments = Array.from({ length: 501 }, (_, index) => ({ number: index + 1, thread: thread(index) }));
	const positions = new Map(comments.map(({ thread }, index) => [thread.id, { x: index, y: index }]));
	const html = renderToStaticMarkup(
		<PageCommentPins threads={comments} positions={positions} selectedThread={null} onOpenThread={() => {}} />,
	);

	expect(html.match(/<button/g)).toHaveLength(501);
	expect(html).toContain('aria-label="Comment 501, Navid, open, element main" aria-pressed="false"');
});
