import { afterEach, beforeEach, expect, test } from "bun:test";
import { rm, writeFile } from "node:fs/promises";
import { EditorContentSchema } from "@trellis/api";
import { manifestFixture } from "./components/fixture.ts";
import { installedEditorManifest } from "./installedEditorManifest.ts";

let h: Awaited<ReturnType<typeof manifestFixture>>;
beforeEach(async () => {
	h = await manifestFixture();
});
afterEach(async () => {
	await rm(h.directory, { recursive: true });
});
const content = () => EditorContentSchema.parse(h.content);

test("an absent export stays null and preserves every catalog blocker", async () => {
	const manifest = await installedEditorManifest(h.identity);
	expect(manifest.publicManifest).toEqual({ ...h.catalog, frontendTemplates: null });
	await manifest.assertContent({ ...content(), graphDocument: { nodes: [], edges: [] } });
	await expect(manifest.assertContent(content())).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
});

test("native draft edits preserve code, output contracts, and publication blockers", async () => {
	const manifest = await installedEditorManifest(await h.sealTemplates());
	h.node.data.node.template.text.value = " exact\r\nβ ";
	h.node.data.node.template.text.advanced = true;
	h.node.data.node.template.text.password = false;
	h.node.data.node.template.minutes.value = 100000;
	h.node.data.node.display_name = "New name";
	h.node.data.node.description = "New description";
	h.node.data.node.outputs[0]!.selected = "Message";
	Object.assign(h.node.data, { showNode: false, selected_output: "result" });
	h.node.position = { x: 1e12, y: -1e12 };
	await manifest.assertContent(content());
	expect(manifest.publicManifest).toEqual({ ...h.catalog, frontendTemplates: h.envelope });
	expect(manifest.publicManifest.allowedForPublication).toBe(false);
	delete h.node.data.node.outputs[0]!.selected;
	await manifest.assertContent(content());
});

test("caller changes to the public manifest cannot change validation authority", async () => {
	const manifest = await installedEditorManifest(await h.sealTemplates());
	Object.assign(manifest.publicManifest, { allowedForPublication: true, frontendTemplates: null });
	h.node.data.node.template.code.value = "substitute";
	await expect(manifest.assertContent(content())).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
});

test.each(["code", "method", "type", "refresh", "selection", "output", "password"])(
	"refuses a substituted %s",
	async (field) => {
		const manifest = await installedEditorManifest(await h.sealTemplates());
		if (field === "code") h.node.data.node.template.code.value += "substitute";
		if (field === "method") h.node.data.node.outputs[0]!.method = "execute";
		if (field === "type") h.node.data.node.template.text.type = "code";
		if (field === "refresh") Object.assign(h.node.data.node, { tool_mode: true });
		if (field === "selection") h.node.data.node.outputs[0]!.selected = "Unlisted";
		if (field === "output") Object.assign(h.node.data, { selected_output: "unlisted" });
		if (field === "password") Object.assign(h.node.data.node.template.minutes, { password: true });
		await expect(manifest.assertContent(content())).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	},
);

test.each(["catalog", "overlay", "blocker", "qualification", "source", "engine"])(
	"refuses a resealed export with a conflicting %s",
	async (field) => {
		if (field === "catalog") h.envelope.componentManifestHash = "e".repeat(64);
		if (field === "overlay") h.envelope.engineOverlayHash = "e".repeat(64);
		if (field === "blocker") h.envelope.blockers = { TRACE_REQUIRED: "" };
		if (field === "qualification") h.envelope.definitions[0]!.allowedForPublication = true;
		if (field === "source") h.envelope.definitions[0]!.frontendTemplate.data.node.template.code.value = "substitute";
		if (field === "engine") h.envelope.engine = { ...h.envelope.engine, commit: "e".repeat(40) };
		await expect(installedEditorManifest(await h.sealTemplates())).rejects.toThrow();
	},
);

test.each(["catalog", "templates"])("refuses changed %s bytes after the package load", async (file) => {
	const identity = await h.sealTemplates();
	await writeFile(file === "catalog" ? h.catalogPath : h.templatePath, "{}");
	await expect(installedEditorManifest(identity)).rejects.toThrow("editor_package_file_changed");
});

test("checks graph identities and manifest binding", async () => {
	const manifest = await installedEditorManifest(await h.sealTemplates());
	await expect(manifest.assertContent({ ...content(), componentManifestHash: "e".repeat(64) })).rejects.toThrow();
	h.node.data.id = "different";
	await expect(manifest.assertContent(content())).rejects.toThrow();
	h.node.data.id = h.node.id;
	const graph = content().graphDocument;
	if (!Array.isArray(graph.nodes)) throw new Error("fixture_nodes");
	const node = graph.nodes[0]!;
	await expect(
		manifest.assertContent({ ...content(), graphDocument: { ...graph, nodes: [node, node] } }),
	).rejects.toThrow();
	await expect(
		manifest.assertContent({
			...content(),
			graphDocument: { ...graph, edges: [{ id: "edge", source: "instance", target: "missing" }] },
		}),
	).rejects.toThrow();
});
