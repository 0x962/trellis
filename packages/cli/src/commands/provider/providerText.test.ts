import { expect, test } from "bun:test";
import type { Provider } from "@trellis/api";
import type { CliContext } from "../../context.ts";
import { renderRecord, renderTable } from "../../output.ts";
import { providerCreateInput, providerList, providerRecord, providerUpdateInput } from "./providerText.ts";

const context = (stdin = "provider-key\n"): CliContext =>
	({ deps: { stdin: () => Promise.resolve(stdin) } }) as CliContext;

const provider = (fields: Partial<Provider> = {}): Provider => ({
	id: "01M39A00000000000000000000",
	name: "Local",
	kind: "openai-compatible",
	baseUrl: "https://models.example.com",
	keyLast4: "1234",
	enabled: false,
	models: ["Qwen/Qwen2.5-72B-Instruct", "qwen2.5-coder:7b"],
	createdAt: "2026-09-24T20:00:00.000Z",
	updatedAt: "2026-09-24T20:00:00.000Z",
	...fields,
});

test("builds create input from standard input and repeated model flags", async () => {
	await expect(
		providerCreateInput(
			context("secret-key\n"),
			["--name", "Local", "--kind", "openai-compatible", "--api-key", "-", "--model", "one", "--model=two"],
			{
				name: "Local",
				kind: "openai-compatible",
				"base-url": "https://models.example.com/v1",
				"api-key": "-",
				disabled: true,
			},
		),
	).resolves.toEqual({
		name: "Local",
		kind: "openai-compatible",
		baseUrl: "https://models.example.com/v1",
		apiKey: "secret-key",
		enabled: false,
		models: ["one", "two"],
	});
});

test("refuses a key argument and conflicting model flags", async () => {
	await expect(
		providerCreateInput(context(), ["--api-key", "visible"], {
			name: "Vercel",
			kind: "vercel-ai-gateway",
			"api-key": "visible",
		}),
	).rejects.toThrow("--api-key takes - and reads the key from standard input.");
	await expect(
		providerUpdateInput(context(), ["--model", "one", "--no-models"], { id: provider().id }),
	).rejects.toThrow("Use --model or --no-models, not both.");
});

test("builds edit input with a replacement or an empty model set", async () => {
	await expect(
		providerUpdateInput(context("new-key\n"), ["--model", "one", "--model", "two"], {
			id: provider().id,
			"api-key": "-",
			enabled: "true",
		}),
	).resolves.toEqual({ id: provider().id, apiKey: "new-key", enabled: true, models: ["one", "two"] });
	await expect(providerUpdateInput(context(), ["--no-models"], { id: provider().id })).resolves.toEqual({
		id: provider().id,
		models: [],
	});
});

test("prints provider lists and hides a short key", () => {
	const text = renderTable([provider()], providerList.columns);
	expect(text).toContain("id                          name   kind               enabled  models  key\n");
	expect(text).toContain("Local  openai-compatible  false    2       ••••1234\n");
	const record = renderRecord(provider({ keyLast4: "", models: [] }), providerRecord.fields);
	expect(record).toContain("key:      ••••\n");
	expect(record).toContain("models:   -\n");
});
