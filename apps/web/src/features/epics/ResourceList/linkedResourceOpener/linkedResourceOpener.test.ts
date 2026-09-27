import { expect, test } from "bun:test";
import type { Resource } from "@trellis/api";
import { linkedResourceOpener } from "./linkedResourceOpener";

const resources = [
	{ id: "file", kind: "file" },
	{ id: "document", kind: "doc" },
	{ id: "image", kind: "image" },
] as Resource[];

test("opens a linked file after its epic resources arrive, once per visit", () => {
	const update = linkedResourceOpener();
	const opened: string[] = [];
	const open = (id: string) => opened.push(id);
	update("file", [], open);
	expect(opened).toEqual([]);
	update("file", resources, open);
	update("file", [...resources], open);
	expect(opened).toEqual(["file"]);
	update(undefined, resources, open);
	update("file", resources, open);
	expect(opened).toEqual(["file", "file"]);
});

test("follows a new target in the same epic without reopening a document", () => {
	const update = linkedResourceOpener();
	const opened: string[] = [];
	const open = (id: string) => opened.push(id);
	update("file", resources, open);
	update("document", resources, open);
	update("image", resources, open);
	update("missing", resources, open);
	expect(opened).toEqual(["file", "image"]);
});
