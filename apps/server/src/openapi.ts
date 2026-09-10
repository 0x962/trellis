import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { contract } from "@trellis/api";
import { API_VERSION } from "./context.ts";
import {
	ACTOR_HEADER_DESCRIPTION,
	ACTOR_HEADER_EXAMPLE,
	BODY_EXAMPLES,
	DESCRIPTION,
	SERVERS,
	TAGS,
} from "./openapiText.ts";

type Parameter = {
	name: string;
	in: string;
	required?: boolean;
	description?: string;
	example?: unknown;
	schema?: unknown;
};
type BodySchema = { properties?: Record<string, unknown>; required?: string[] };
type MediaType = { example?: unknown; examples?: Record<string, unknown>; schema?: BodySchema };
type Operation = { parameters?: Parameter[]; requestBody?: { content: Record<string, MediaType> } };
type Paths = Record<string, Record<string, Operation>>;

export type OpenApiBuild = { document: Awaited<ReturnType<OpenAPIGenerator["generate"]>>; warnings: string[] };

const METHODS = ["get", "post", "put", "patch", "delete"];

const actorParameter = (): Parameter => ({
	name: "x-trellis-actor",
	in: "header",
	required: true,
	description: ACTOR_HEADER_DESCRIPTION,
	example: ACTOR_HEADER_EXAMPLE,
	schema: { type: "string", pattern: "^(human|agent):[^:]{1,64}$" },
});

// The generator writes the options of a DELETE as a JSON body. The server
// reads them from the query string, so the document says so.
const bodyToQuery = (operation: Operation) => {
	const schema = operation.requestBody?.content["application/json"]?.schema;
	delete operation.requestBody;
	if (schema?.properties === undefined) return;
	for (const [name, property] of Object.entries(schema.properties)) {
		operation.parameters = [
			...(operation.parameters ?? []),
			{ name, in: "query", required: schema.required?.includes(name) ?? false, schema: property },
		];
	}
};

// Adds what the generator cannot know: the actor header on every mutation
// and one example per request body.
const postProcess = (paths: Paths) => {
	for (const [path, methods] of Object.entries(paths)) {
		for (const [method, operation] of Object.entries(methods)) {
			if (!METHODS.includes(method)) continue;
			if (method !== "get") operation.parameters = [actorParameter(), ...(operation.parameters ?? [])];
			if (method === "delete") bodyToQuery(operation);
			const example = BODY_EXAMPLES[`${method.toUpperCase()} ${path}`];
			if (operation.requestBody === undefined) continue;
			for (const media of Object.values(operation.requestBody.content)) media.example = example;
		}
	}
};

// The document Scalar renders and an agent reads. A generator warning is
// a schema the converter could not express; the build test keeps the list
// empty.
export const buildOpenApiDocument = async (): Promise<OpenApiBuild> => {
	const warnings: string[] = [];
	const warn = console.warn;
	console.warn = (...args: unknown[]) => {
		warnings.push(args.map(String).join(" "));
	};
	const generator = new OpenAPIGenerator({ schemaConverters: [new ZodToJsonSchemaConverter()] });
	const document = await generator
		.generate(contract, {
			info: { title: "trellis", version: API_VERSION, description: DESCRIPTION },
			servers: SERVERS,
			tags: TAGS,
		})
		.finally(() => {
			console.warn = warn;
		});
	postProcess(document.paths as Paths);
	return { document, warnings };
};
