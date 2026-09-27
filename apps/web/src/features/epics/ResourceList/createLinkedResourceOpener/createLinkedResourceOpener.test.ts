import { expect, test } from "bun:test";
import type { Resource } from "@trellis/api";
import { createLinkedResourceOpener } from "./createLinkedResourceOpener";

const resources = [
	{ id: "file", kind: "file" },
	{ id: "document", kind: "doc" },
	{ id: "image", kind: "image" },
] as Resource[];

test("opens a linked file after its direct lookup completes, once per visit", () => {
	const update = createLinkedResourceOpener();
	const opened: string[] = [];
	const open = (resource: Resource) => opened.push(resource.id);
	update("file", undefined, open);
	expect(opened).toEqual([]);
	update("file", resources[0], open);
	update("file", { ...resources[0]! }, open);
	expect(opened).toEqual(["file"]);
	update(undefined, resources[0], open);
	update("file", resources[0], open);
	expect(opened).toEqual(["file", "file"]);
});

test("follows a new target in the same epic without reopening a document", () => {
	const update = createLinkedResourceOpener();
	const opened: string[] = [];
	const open = (resource: Resource) => opened.push(resource.id);
	update("file", resources[0], open);
	update("document", resources[1], open);
	update("image", resources[2], open);
	update("missing", resources[2], open);
	expect(opened).toEqual(["file", "image"]);
});
