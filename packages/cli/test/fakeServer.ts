import { StandardRPCJsonSerializer, StandardRPCSerializer } from "@orpc/client/standard";
import { contract, type ErrorCode, errors } from "@trellis/api";
import apiPkg from "../../api/package.json";

// The api version a real server sends in `x-trellis-api-version`.
export const apiVersion: string = apiPkg.version;

const jsonSerializer = new StandardRPCJsonSerializer();
const serializer = new StandardRPCSerializer(jsonSerializer);

const errorMarker = Symbol("rpcError");

type RpcErrorBody = {
	[errorMarker]: true;
	defined: boolean;
	code: string;
	status: number;
	message: string;
	data: unknown;
};

// A route answer that makes the fake server fail the call with a declared
// error. `status` and the default message come from the contract's map.
export const rpcError = (code: ErrorCode, data?: unknown, message = errors[code].message): RpcErrorBody => ({
	[errorMarker]: true,
	defined: true,
	code,
	status: errors[code].status,
	message,
	data,
});

// An error the contract does not declare: what a crashed handler answers.
export const serverError = (message = "Internal server error"): RpcErrorBody => ({
	[errorMarker]: true,
	defined: false,
	code: "INTERNAL_SERVER_ERROR",
	status: 500,
	message,
	data: undefined,
});

const isRpcError = (value: unknown): value is RpcErrorBody =>
	typeof value === "object" && value !== null && errorMarker in value;

// biome-ignore lint/suspicious/noExplicitAny: a route reads the decoded input of its own procedure.
export type Handler = (input: any, request: Request) => unknown;

export type Routes = Record<string, unknown>;

// One decoded RPC call: `path` is the dotted procedure name (`tickets.get`).
export type Call = { path: string; input: unknown; request: Request };

export type FakeServerOptions = {
	// The `x-trellis-api-version` value on every answer; null sends no header.
	serverApiVersion?: string | null;
	// Answers every request outside `/rpc/`: the SSE and export routes.
	raw?: (request: Request) => Response | Promise<Response>;
};

export type FakeServer = {
	fetch: (request: Request) => Promise<Response>;
	calls: Call[];
	requests: Request[];
};

// Decodes the body the RPC link sent: JSON, or multipart when the input
// holds a file.
const decodeInput = async (request: Request): Promise<unknown> => {
	const contentType = request.headers.get("content-type") ?? "";
	if (contentType.startsWith("multipart/form-data")) return serializer.deserialize(await request.formData());
	return serializer.deserialize(await request.json());
};

type StandardSchema = {
	validate: (input: unknown) => { issues?: ReadonlyArray<{ path?: unknown; message: string }> };
};

// The input schema the contract declares for a dotted procedure path, or
// undefined for a procedure without an input (`system.health`).
const inputSchemaOf = (path: string): StandardSchema | undefined => {
	// biome-ignore lint/suspicious/noExplicitAny: the contract is walked by its dotted path.
	const procedure = path.split(".").reduce((node: any, key) => node[key], contract);
	return procedure["~orpc"].inputSchema?.["~standard"];
};

// An input the contract refuses fails the test at the fake, the way the real
// server answers INPUT_VALIDATION_FAILED. A verb whose test passes here sends
// what the server accepts.
const assertValidInput = (path: string, input: unknown) => {
	const result = inputSchemaOf(path)?.validate(input);
	if (result === undefined || result.issues === undefined) return;
	const detail = result.issues.map((issue) => `${JSON.stringify(issue.path ?? [])}: ${issue.message}`).join("; ");
	throw new Error(`fake server: ${path} refuses the input: ${detail}`);
};

const encode = (body: unknown, status: number, headers: Record<string, string>) => {
	const [json, meta] = jsonSerializer.serialize(body);
	return new Response(JSON.stringify({ json, meta }), {
		status,
		headers: { "content-type": "application/json", ...headers },
	});
};

// A fetch that answers canned oRPC responses. `routes` maps a dotted
// procedure path to a value, an `rpcError`, or a handler that receives the
// decoded input. A call to a path without a route throws, so a verb that
// sends an unexpected request fails its test at the fake, not later.
export const fakeServer = (routes: Routes = {}, options: FakeServerOptions = {}): FakeServer => {
	const calls: Call[] = [];
	const requests: Request[] = [];
	const versionHeader: Record<string, string> =
		options.serverApiVersion === null ? {} : { "x-trellis-api-version": options.serverApiVersion ?? apiVersion };
	const fetch = async (request: Request): Promise<Response> => {
		requests.push(request);
		const url = new URL(request.url);
		if (!url.pathname.startsWith("/rpc/")) {
			const response = await options.raw!(request);
			for (const [name, value] of Object.entries(versionHeader)) response.headers.set(name, value);
			return response;
		}
		const path = url.pathname.slice("/rpc/".length).replaceAll("/", ".");
		const input = await decodeInput(request);
		calls.push({ path, input, request });
		if (!(path in routes)) throw new Error(`fake server: no route for ${path}`);
		assertValidInput(path, input);
		const route = routes[path];
		const answer = typeof route === "function" ? await (route as Handler)(input, request) : route;
		if (isRpcError(answer)) {
			const { [errorMarker]: _, ...body } = answer;
			return encode(body, answer.status, versionHeader);
		}
		return encode(answer, 200, versionHeader);
	};
	return { fetch, calls, requests };
};

// A fetch that fails the way Bun's fetch fails against a closed port.
export const refusedFetch = async (request: Request): Promise<Response> => {
	void request;
	throw Object.assign(new Error("Unable to connect"), { code: "ECONNREFUSED" });
};
