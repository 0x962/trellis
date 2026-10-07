import type { PageCommentThread, PageDetail, PageListInput, PageRenderLease } from "@trellis/api";
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

export const historicalPageThread: PageCommentThread = {
	...pageThread,
	id: id(612),
	version: 1,
	anchor: { kind: "text", path: "html>body>main>p", quote: "Earlier version text.", prefix: "", suffix: "" },
	selectedText: "Earlier version text.",
	comments: [
		{
			...pageThread.comments[0]!,
			id: id(613),
			threadId: id(612),
			body: "Open the source version and keep this comment selected.",
		},
	],
};

const longSections = Array.from(
	{ length: 24 },
	(_, index) =>
		`<section><h2>Review section ${index + 1}</h2><p>The Page keeps long content readable without covering the text.</p></section>`,
).join("");

const frameDocument = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Interface review</title><style>body{font-family:system-ui;margin:0;padding:32px;line-height:1.5}main{max-width:72ch;margin:auto}section{padding-block:16px;border-block-end:1px solid #ddd}@media(prefers-reduced-motion:reduce){*{animation:none!important;scroll-behavior:auto!important;transition:none!important}}</style><body><main><h1>Interface review</h1><p>The title remains readable.</p><p><a href="https://example.com">Example link</a></p><h2>Acceptance checks</h2><ul><li>The ticket identifier remains visible.</li><li>The controls support keyboard access.</li><li>The phone layout preserves the reading order.</li></ul>${longSections}</main><script>parent.postMessage({type:"page-ready",nonce:"storybook-page-nonce"},"*");addEventListener("click",event=>{const link=event.target.closest("a");if(!link)return;event.preventDefault();parent.postMessage({type:"page-link",nonce:"storybook-page-nonce",href:link.href},"*")});addEventListener("message",event=>{if(event.data.type==="page-comments-state")parent.postMessage({type:"page-comment-layout",nonce:"storybook-page-nonce",items:event.data.comments.map((comment,index)=>({thread:comment.thread,x:24,y:96+index*48}))},"*")});</script></body></html>`;

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

const pages = [
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
];

export const pageResponses = {
	...projectResponses,
	"pages.list": (input: PageListInput) => ({
		items: pages.filter((item) => {
			if (input.q && !`${item.title} ${item.summary}`.toLowerCase().includes(input.q.toLowerCase())) return false;
			if (input.pinned !== undefined && item.pinned !== input.pinned) return false;
			if (input.comment === "open" && item.openThreadCount === 0) return false;
			if (input.comment === "none" && item.openThreadCount !== 0) return false;
			if (input.author && `${item.publishedBy.kind}:${item.publishedBy.name}` !== input.author) return false;
			if (input.watcher && item.watcher?.agent.id !== input.watcher) return false;
			return true;
		}),
		nextCursor: null,
	}),
	"pages.get": page,
	"pages.comments": [pageThread],
	"pages.versions": {
		items: [page.requestedVersion, { ...page.requestedVersion, number: 1, label: "First copy" }],
		nextCursor: null,
	},
	"pages.watcherOptions": { items: [], nextCursor: null },
	"pages.createRenderLease": pageLease,
	"pages.renewRenderLease": pageLease,
	"pages.comment": pageThread,
	"pages.commentReply": {},
	"pages.commentResolve": {},
	"pages.commentEdit": {},
	"pages.commentDelete": {},
	"pages.pin": {},
	"pages.update": {},
	"pages.delete": {},
	"pages.restore": {},
};
