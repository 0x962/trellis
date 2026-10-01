import type { Attachment, Resource, ResourceCommentThread } from "@trellis/api";
import attachmentPreview from "./attachmentPreview.jpg";
import { epic } from "./epic";
import { actor, id, ticket, timestamp } from "./project";

export const attachments: Attachment[] = [
	{
		id: id(800),
		ticketId: ticket.id,
		filename: "Review image.jpg",
		mime: "image/jpeg",
		size: 19000,
		sha256: "a".repeat(64),
		actor,
		createdAt: timestamp,
		url: attachmentPreview,
	},
	{
		id: id(801),
		ticketId: ticket.id,
		filename: "Interface acceptance checks with a long descriptive filename.txt",
		mime: "text/plain",
		size: 96,
		sha256: "b".repeat(64),
		actor,
		createdAt: timestamp,
		url: "data:text/plain,The%20ticket%20identifier%20remains%20visible.%0AThe%20controls%20support%20keyboard%20access.",
	},
];

export const documentResource: Resource = {
	id: id(810),
	epicId: epic.id,
	kind: "doc",
	name: "Interface acceptance checks",
	body: "## Required states\n\nThe ticket identifier remains visible.\n\nThe controls support keyboard access.\n\n- Populated\n- Empty\n- Loading\n- Error",
	url: null,
	blob: null,
	ticketId: ticket.id,
	pullRequestNumber: null,
	actor,
	createdAt: timestamp,
	updatedAt: timestamp,
};

export const imageResource: Resource = {
	...documentResource,
	id: id(811),
	kind: "image",
	name: "Review image.jpg",
	body: null,
	blob: { sha256: "a".repeat(64), url: attachmentPreview, size: 19000 },
};

export const resources: Resource[] = [
	documentResource,
	{
		...documentResource,
		id: id(812),
		kind: "link",
		name: "Project reference",
		body: null,
		url: "https://example.com/reference",
	},
	imageResource,
	{
		...documentResource,
		id: id(813),
		kind: "file",
		name: "Acceptance checks.txt",
		body: null,
		blob: { sha256: "b".repeat(64), url: attachments[1]!.url, size: 96 },
	},
];

export const resourceThread: ResourceCommentThread = {
	id: id(820),
	resourceId: documentResource.id,
	anchor: {
		quote: "The ticket identifier remains visible.",
		prefix: "Required states\n\n",
		suffix: "\n\nThe controls support keyboard",
	},
	textRemoved: false,
	resolved: null,
	comments: [
		{ id: id(820), body: "Check the identifier at a phone width.", actor, createdAt: timestamp, updatedAt: timestamp },
	],
};
