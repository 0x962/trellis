import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { openTestDb } from "../../../db/testDb.ts";
import { remoteHarness } from "../testSupport/testSupport.ts";
import { generateText, ProviderGenerationError, type ProviderTextGenerationInput } from "./generateText.ts";

const MODEL = "anthropic/claude-sonnet-5.5";
const privateInput = {
	model: MODEL,
	systemInstruction: "Explain private-project.ts without exposing it.",
	messages: [
		{ role: "user" as const, content: "The first private message." },
		{ role: "assistant" as const, content: "The prior private reply." },
		{ role: "user" as const, content: "The second private message." },
	],
};

let db: Awaited<ReturnType<typeof openTestDb>>;
beforeAll(async () => {
	db = await openTestDb();
}, 30_000);
afterAll(async () => {
	await db.$client.close();
});

test("sends the exact model and returns the complete reply with usage", async () => {
	await db.execute(sql`DELETE FROM providers`);
	const h = remoteHarness(db);
	const provider = await h.create({ models: [MODEL] });
	const controller = new AbortController();
	let insideTransaction = false;
	const ctx = {
		log: h.ctx.log,
		newTx: async <T>(fn: Parameters<typeof h.ctx.newTx<T>>[0]) => {
			insideTransaction = true;
			const result = await h.ctx.newTx(fn);
			insideTransaction = false;
			return result;
		},
	};
	const result = await generateText(
		ctx,
		{ providerId: provider.id, ...privateInput, signal: controller.signal },
		async (url, init) => {
			expect(insideTransaction).toBe(false);
			expect(url).toBe("https://ai-gateway.vercel.sh/v1/responses");
			expect(init).toMatchObject({ method: "POST", redirect: "manual", signal: controller.signal });
			expect(init.headers).toEqual({
				Authorization: "Bearer secret-provider-1234",
				"Content-Type": "application/json",
			});
			expect(JSON.parse(init.body as string)).toEqual({
				model: MODEL,
				instructions: privateInput.systemInstruction,
				input: privateInput.messages.map((message) => ({ type: "message", ...message })),
			});
			return Response.json({
				id: "response-1",
				model: MODEL,
				output: [
					{ type: "reasoning", summary: [] },
					{
						type: "message",
						role: "assistant",
						content: [
							{ type: "output_text", text: "Complete " },
							{ type: "output_text", text: "reply." },
						],
					},
				],
				usage: {
					input_tokens: 120,
					output_tokens: 30,
					total_tokens: 150,
					input_tokens_details: { cached_tokens: 80 },
					output_tokens_details: { reasoning_tokens: 10 },
				},
			});
		},
	);
	expect(result).toEqual({
		text: "Complete reply.",
		responseId: "response-1",
		responseModel: MODEL,
		usage: {
			inputTokens: 120,
			outputTokens: 30,
			totalTokens: 150,
			cachedInputTokens: 80,
			reasoningOutputTokens: 10,
		},
	});
	expect(JSON.stringify(h.logs)).not.toContain("private-project.ts");
	expect(JSON.stringify(h.logs)).not.toContain("private message");
	expect(JSON.stringify(h.logs)).not.toContain("secret-provider-1234");
});

test("refuses a missing, disabled, incompatible, or unoffered provider", async () => {
	await db.execute(sql`DELETE FROM providers`);
	const h = remoteHarness(db);
	const disabled = await h.create({ enabled: false, models: [MODEL] });
	const incompatible = await h.create({
		kind: "openai-compatible",
		baseUrl: "https://models.example",
		models: [MODEL],
	});
	const unoffered = await h.create({ models: ["anthropic/claude-sonnet-5"] });
	for (const providerId of ["01M00000000000000000000000", disabled.id, incompatible.id, unoffered.id]) {
		await expect(
			generateText(h.ctx, { providerId, ...privateInput, signal: new AbortController().signal }, async () => {
				throw new Error("must not fetch");
			}),
		).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE", status: null });
	}
});

test("cancels an in-flight request with the caller signal", async () => {
	await db.execute(sql`DELETE FROM providers`);
	const h = remoteHarness(db);
	const provider = await h.create({ models: [MODEL] });
	const controller = new AbortController();
	let requestStarted!: () => void;
	const started = new Promise<void>((resolve) => {
		requestStarted = resolve;
	});
	const request = generateText(
		h.ctx,
		{ providerId: provider.id, ...privateInput, signal: controller.signal },
		async (_url, init) => {
			expect(init.signal).toBe(controller.signal);
			requestStarted();
			return new Promise<Response>((_resolve, reject) => {
				init.signal!.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
			});
		},
	);
	await started;
	controller.abort();
	await expect(request).rejects.toMatchObject({
		code: "PROVIDER_REQUEST_CANCELED",
		message: "The provider text request was canceled.",
	});
});

test("returns actionable HTTP and network failures without remote content", async () => {
	await db.execute(sql`DELETE FROM providers`);
	const h = remoteHarness(db);
	const provider = await h.create({ models: [MODEL] });
	const input: ProviderTextGenerationInput = {
		providerId: provider.id,
		...privateInput,
		signal: new AbortController().signal,
	};
	for (const [status, message] of [
		[401, "The Vercel provider refused its key."],
		[429, "The Vercel provider rate limit stopped the text request."],
	] as const) {
		await expect(
			generateText(h.ctx, input, async () => new Response("secret-provider-1234 private-project.ts", { status })),
		).rejects.toEqual(new ProviderGenerationError("PROVIDER_HTTP_ERROR", message, status));
	}
	await expect(
		generateText(h.ctx, input, async () => {
			throw new Error("secret-provider-1234 private-project.ts");
		}),
	).rejects.toMatchObject({ code: "PROVIDER_UNREACHABLE", message: "Trellis cannot reach ai-gateway.vercel.sh." });
	expect(JSON.stringify(h.logs)).not.toContain("secret-provider-1234");
	expect(JSON.stringify(h.logs)).not.toContain("private-project.ts");
});

test("returns a typed context-capacity failure", async () => {
	await db.execute(sql`DELETE FROM providers`);
	const h = remoteHarness(db);
	const provider = await h.create({ models: [MODEL] });
	await expect(
		generateText(
			h.ctx,
			{
				providerId: provider.id,
				...privateInput,
				signal: new AbortController().signal,
			},
			async () =>
				Response.json(
					{
						error: {
							type: "invalid_request_error",
							code: "context_length_exceeded",
							message: "private-project.ts is too long",
						},
					},
					{ status: 400 },
				),
		),
	).rejects.toEqual(
		new ProviderGenerationError(
			"PROVIDER_CONTEXT_CAPACITY",
			"The provider context capacity is too small for this text request.",
			400,
		),
	);
	expect(JSON.stringify(h.logs)).not.toContain("private-project.ts");
});

test("refuses a response without complete assistant text or usage", async () => {
	await db.execute(sql`DELETE FROM providers`);
	const h = remoteHarness(db);
	const provider = await h.create({ models: [MODEL] });
	const input: ProviderTextGenerationInput = {
		providerId: provider.id,
		...privateInput,
		signal: new AbortController().signal,
	};
	for (const body of [
		{ id: "response-1", model: MODEL, output: [], usage: { input_tokens: 1, output_tokens: 0 } },
		{ id: "response-1", model: MODEL, output: [{ type: "message", role: "assistant", content: [] }] },
	]) {
		await expect(generateText(h.ctx, input, async () => Response.json(body))).rejects.toMatchObject({
			code: "PROVIDER_INVALID_RESPONSE",
			message: "The Vercel provider returned an invalid text response.",
		});
	}
	expect(JSON.stringify(h.logs)).not.toContain("private-project.ts");
});
