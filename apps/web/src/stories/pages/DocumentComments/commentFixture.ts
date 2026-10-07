import type { ResourceCommentAnchor, ResourceCommentThread } from "@trellis/api";
import { actor, id, timestamp } from "../fixtures/project";
import { documentResource, resources, resourceThread } from "../fixtures/resources";
import { projectResponses } from "../fixtures/responses";

export function commentFixture() {
	let document = structuredClone(documentResource);
	let threads: ResourceCommentThread[] = [];
	let fail = "";
	let serial = 900;
	let pendingList: Promise<ResourceCommentThread[]> | null = null;
	const comment = (body: string) => ({
		id: id(serial++),
		body,
		actor,
		createdAt: timestamp,
		updatedAt: timestamp,
	});
	return {
		reset(error = "", seed = false) {
			document = structuredClone(documentResource);
			threads = seed ? [structuredClone(resourceThread)] : [];
			fail = error;
			serial = 900;
			pendingList = null;
		},
		recover: () => {
			fail = "";
		},
		delayRecovery: () => {
			fail = "";
			const { promise, resolve } = Promise.withResolvers<ResourceCommentThread[]>();
			pendingList = promise;
			return () => {
				pendingList = null;
				resolve(threads);
			};
		},
		snapshot: () => structuredClone({ document, threads }),
		responses: {
			...projectResponses,
			"resources.list": () => resources.map((resource) => (resource.id === document.id ? document : resource)),
			"resources.get": () => document,
			"resources.update": (input: unknown) => {
				document = { ...document, ...(input as { body?: string; name?: string }) };
				return document;
			},
			"resourceComments.list": () => {
				if (fail === "load") throw new Error("The comment request failed.");
				return pendingList ?? threads;
			},
			"resourceComments.create": (input: unknown) => {
				if (fail === "create") throw new Error("The comment was not saved.");
				const value = input as { resource: string; anchor: ResourceCommentAnchor; body: string };
				const first = comment(value.body);
				const thread = {
					id: first.id,
					resourceId: value.resource,
					anchor: value.anchor,
					textRemoved: false,
					resolved: null,
					comments: [first],
				};
				threads.push(thread);
				return thread;
			},
			"resourceComments.reply": (input: unknown) => {
				if (fail === "reply") throw new Error("The reply was not saved.");
				const value = input as { thread: string; body: string };
				const thread = threads.find((item) => item.id === value.thread)!;
				thread.comments.push(comment(value.body));
				return thread;
			},
			"resourceComments.resolve": (input: unknown) => {
				const value = input as { thread: string; resolved: boolean };
				const thread = threads.find((item) => item.id === value.thread)!;
				thread.resolved = value.resolved ? { actor, at: timestamp } : null;
				return thread;
			},
			"resourceComments.anchors": (input: unknown) => {
				const value = input as { anchors: { thread: string; anchor: ResourceCommentAnchor; textRemoved: boolean }[] };
				for (const move of value.anchors) {
					Object.assign(threads.find((thread) => thread.id === move.thread)!, {
						anchor: move.anchor,
						textRemoved: move.textRemoved,
					});
				}
				return threads;
			},
		},
	};
}
