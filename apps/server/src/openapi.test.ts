import { beforeAll, describe, expect, test } from "bun:test";
import { contract } from "@trellis/api";
import { buildOpenApiDocument } from "./openapi.ts";

// The generated document is post-processed so an agent that reads
// /api/openapi.json alone can work: the actor header on every mutation, the
// ref grammars, the list grammar, the never-Done rule, both curl forms, a
// described tag per router, one example per request body, and the two
// server URLs.

type Parameter = { name: string; in: string; required?: boolean; description?: string; example?: unknown };
type MediaType = { example?: unknown; examples?: Record<string, unknown>; schema?: unknown };
type Operation = {
	operationId?: string;
	tags?: string[];
	parameters?: Parameter[];
	requestBody?: { content: Record<string, MediaType> };
	responses?: Record<string, { content?: Record<string, MediaType> }>;
};
type Document = {
	openapi: string;
	info: { title: string; version: string; description?: string };
	servers?: Array<{ url: string }>;
	tags?: Array<{ name: string; description?: string }>;
	paths: Record<string, Record<string, Operation>>;
};

const METHODS = ["get", "post", "put", "patch", "delete"];

type Found = { method: string; path: string; operation: Operation };

let document: Document;
let warnings: string[];
let operations: Found[];

beforeAll(async () => {
	const built = await buildOpenApiDocument();
	document = built.document as Document;
	warnings = built.warnings;
	operations = Object.entries(document.paths).flatMap(([path, methods]) =>
		Object.entries(methods)
			.filter(([method]) => METHODS.includes(method))
			.map(([method, operation]) => ({ method, path, operation })),
	);
});

const actorParameter = (operation: Operation) =>
	operation.parameters?.find((parameter) => parameter.name === "x-trellis-actor" && parameter.in === "header");

describe("actor header", () => {
	test("every non-GET operation declares the actor header parameter", () => {
		const mutations = operations.filter(({ method }) => method !== "get");
		expect(mutations.length).toBeGreaterThanOrEqual(25);
		for (const { method, path, operation } of mutations) {
			const parameter = actorParameter(operation);
			expect(parameter, `${method} ${path}`).toBeDefined();
			expect(parameter!.required, `${method} ${path}`).toBe(true);
			expect(parameter!.description, `${method} ${path}`).toMatch(/<human\|agent>:<name>/);
			expect(parameter!.example, `${method} ${path}`).toMatch(/^(human|agent):.+/);
		}
	});

	test("no GET operation declares the actor header parameter", () => {
		const reads = operations.filter(({ method }) => method === "get");
		expect(reads.length).toBeGreaterThanOrEqual(20);
		for (const { path, operation } of reads) expect(actorParameter(operation), path).toBeUndefined();
	});

	test("the info description states the actor rule", () => {
		const description = document.info.description ?? "";
		expect(description).toMatch(/every non-GET request/i);
		expect(description).toContain("x-trellis-actor");
		expect(description).toMatch(/GET[^.\n]*ignore/i);
	});
});

describe("info description", () => {
	test("the info description carries the three ref grammars", () => {
		const description = document.info.description ?? "";
		expect(description).toContain("TicketRef");
		expect(description).toContain("CDE-42");
		expect(description).toContain("ProjectRef");
		expect(description).toContain("CDE.web.auth");
		expect(description).toContain("StatusRef");
		expect(description).toContain("category:review");
	});

	test("the info description carries the list grammar", () => {
		const description = document.info.description ?? "";
		expect(description).toContain("project=CDE&status=in-progress,agent-review&parent=none&ci=fail&sort=-updatedAt");
		expect(description).toMatch(/comma/i);
	});

	test("the info description carries the never-Done rule", () => {
		const description = document.info.description ?? "";
		expect(description).toMatch(/agent[^.\n]*never[^.\n]*done/i);
		expect(description).toMatch(/never[^.\n]*delete/i);
	});

	// errors.ts lets an agent pass force past both rules. The text states the
	// rule the server enforces, force included.
	test("the agent rules name force for the done move and for the delete", () => {
		const description = document.info.description ?? "";
		expect(description).toMatch(/agent never moves a ticket to a done status without `force`/i);
		expect(description).toMatch(/agent never deletes a ticket or a project without `force`/i);
	});

	test("the info description carries both curl forms", () => {
		const description = document.info.description ?? "";
		const curls = description.split(/\n(?=[^\n]*\bcurl\b)/).filter((block) => /\bcurl\b/.test(block));
		expect(curls.length).toBeGreaterThanOrEqual(2);
		const create = curls.find(
			(block) => /POST[^\n]*\/api\/tickets(?![^\n]*\/move)/.test(block) || /\/api\/tickets["' ]/.test(block),
		);
		const move = curls.find((block) => block.includes("/move"));
		expect(create).toBeDefined();
		expect(move).toBeDefined();
		expect(create).toContain("x-trellis-actor");
		expect(move).toContain("x-trellis-actor");
	});
});

describe("tags, examples, servers", () => {
	test("every operation carries a described tag", () => {
		const routers = Object.keys(contract);
		const tags = document.tags ?? [];
		expect(tags).toHaveLength(routers.length);
		for (const tag of tags) expect(tag.description, tag.name).toMatch(/\S+/);
		const names = new Set(tags.map((tag) => tag.name));
		for (const { method, path, operation } of operations) {
			expect(operation.tags, `${method} ${path}`).toHaveLength(1);
			expect(names.has(operation.tags![0]!), `${method} ${path} tag ${operation.tags![0]}`).toBe(true);
		}
	});

	test("every request body carries one example", () => {
		const withBody = operations.filter(({ operation }) => operation.requestBody !== undefined);
		expect(withBody.length).toBeGreaterThanOrEqual(10);
		for (const { method, path, operation } of withBody) {
			for (const [type, media] of Object.entries(operation.requestBody!.content)) {
				const count = media.example !== undefined ? 1 : Object.keys(media.examples ?? {}).length;
				expect(count, `${method} ${path} ${type}`).toBe(1);
			}
		}
	});

	test("the document lists the local server URL", () => {
		expect(document.servers?.map((server) => server.url)).toEqual(["http://127.0.0.1:4521/api"]);
	});

	test("the document generates without a warning", () => {
		expect(warnings).toEqual([]);
		expect(document.openapi).toMatch(/^3\.1\./);
		expect(document.info.title).toMatch(/\S+/);
		expect(document.info.version).toMatch(/\S+/);
		expect(Object.keys(document.paths).length).toBeGreaterThanOrEqual(30);
		expect(() => JSON.parse(JSON.stringify(document))).not.toThrow();
	});

	test("a declared contract error appears as its HTTP status response", () => {
		const update = document.paths["/tickets/{ticket}"]?.patch;
		expect(update).toBeDefined();
		const conflict = update!.responses?.["412"];
		expect(conflict).toBeDefined();
		const text = JSON.stringify(conflict);
		expect(text).toContain("VERSION_CONFLICT");
		expect(text).toContain("current");
	});
});
