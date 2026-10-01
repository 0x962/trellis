import type { PageCommentThread, PageDetail, PageRenderLease } from "@trellis/api";
import { actor, id, project, timestamp } from "./project";
import { projectResponses } from "./responses";

export const page: PageDetail = {
	id: id(600),
	projectId: project.id,
	projectKey: project.key,
	ref: "DEMO/pages/interface-review",
	slug: "interface-review",
	title: "Interface review",
	summary: "The review records the screen sizes and required states.",
	revision: 2,
	latestVersion: 2,
	creator: actor,
	actor,
	publishedBy: actor,
	publishedAt: timestamp,
	watcher: null,
	pinned: true,
	openThreadCount: 1,
	deletedAt: null,
	deletedBy: null,
	purgeAt: null,
	createdAt: timestamp,
	updatedAt: timestamp,
	requestedVersion: {
		pageId: id(600),
		number: 2,
		requestId: "11111111-1111-4111-8111-111111111111",
		label: "Review copy",
		documentSha256: "a".repeat(64),
		documentSize: 1024,
		sourceAgentId: null,
		sourcePath: "interface-review.html",
		actor,
		createdAt: timestamp,
	},
	assetCount: 0,
	totalThreadCount: 1,
	resolvedThreadCount: 0,
};

export const pageThread: PageCommentThread = {
	id: id(610),
	pageId: page.id,
	version: 2,
	anchor: { kind: "text", path: "html>body>main>p", quote: "The title remains readable.", prefix: "", suffix: "" },
	selectedText: "The title remains readable.",
	creator: actor,
	resolved: null,
	comments: [
		{
			id: id(611),
			threadId: id(610),
			body: "Check this title at a phone width. The ticket identifier must remain visible.",
			actor,
			createdAt: timestamp,
			updatedAt: timestamp,
			deletedAt: null,
		},
	],
	createdAt: timestamp,
	updatedAt: timestamp,
};

const frameDocument = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Interface review</title><body><main><h1>Interface review</h1><p>The title remains readable.</p><h2>Acceptance checks</h2><ul><li>The ticket identifier remains visible.</li><li>The controls support keyboard access.</li><li>The phone layout preserves the reading order.</li></ul></main><script>parent.postMessage({type:"page-ready",nonce:"storybook-page-nonce"},"*");addEventListener("message",event=>{if(event.data.type==="page-comments-state")parent.postMessage({type:"page-comment-layout",nonce:"storybook-page-nonce",items:event.data.comments.map(comment=>({thread:comment.thread,x:24,y:96}))},"*")});</script></body></html>`;

export const pageLease = (): PageRenderLease => ({
	id: "storybook-page-lease",
	nonce: "storybook-page-nonce",
	frameUrl: `data:text/html;charset=utf-8,${encodeURIComponent(frameDocument)}`,
	contentRoot: "about:blank",
	pageId: page.id,
	version: 2,
	idleExpiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
	absoluteExpiresAt: new Date(Date.now() + 8 * 60 * 60_000).toISOString(),
});

export const pageResponses = {
	...projectResponses,
	"pages.list": {
		items: [
			page,
			{
				...page,
				id: id(601),
				ref: "DEMO/pages/keyboard-review",
				slug: "keyboard-review",
				title: "Keyboard controls and focus order for every action in the ticket, project, and review views",
				pinned: false,
				openThreadCount: 0,
			},
		],
		nextCursor: null,
	},
	"pages.get": page,
	"pages.comments": [pageThread],
	"pages.versions": {
		items: [page.requestedVersion, { ...page.requestedVersion, number: 1, label: "First copy" }],
		nextCursor: null,
	},
	"pages.watcherOptions": { items: [], nextCursor: null },
	"pages.createRenderLease": pageLease,
	"pages.renewRenderLease": pageLease,
};
