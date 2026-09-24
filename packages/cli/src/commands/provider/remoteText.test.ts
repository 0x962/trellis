import { expect, test } from "bun:test";
import type { ProviderCheck, ProviderModels } from "@trellis/api";
import type { CliContext } from "../../context.ts";
import { type Deps, run } from "../../index.ts";
import type { Mode } from "../../output.ts";
import { printProviderCheck, printProviderModels } from "./remoteText.ts";

const at = "2026-09-24T20:00:00.000Z";
const context = (mode: Mode = "table") => {
	let out = "";
	let err = "";
	return {
		ctx: {
			format: { mode, color: false },
			out: {
				write: (text: string) => {
					out += text;
				},
			},
			err: {
				write: (text: string) => {
					err += text;
				},
			},
		} as CliContext,
		out: () => out,
		err: () => err,
	};
};
const catalog: ProviderModels = {
	ok: true,
	detail: null,
	fetchedAt: at,
	models: Array.from({ length: 52 }, (_, i) => ({ id: `model-${i}`, name: `Model ${i}`, type: "language" })),
};

test("prints fifty models and the remaining count, or all models", () => {
	const h = context();
	expect(printProviderModels(h.ctx, catalog, false)).toBe(0);
	expect(h.out()).toContain("model-49");
	expect(h.out()).not.toContain("model-50");
	expect(h.out()).toContain("... 2 more; add --all\n");
	const all = context();
	printProviderModels(all.ctx, catalog, true);
	expect(all.out()).toContain("model-51");
	expect(all.out()).not.toContain("more; add");
	const quiet = context("quiet");
	printProviderModels(quiet.ctx, catalog, true);
	expect(quiet.out()).toBe(catalog.models.map((model) => `${model.id}\n`).join(""));
});

test("prints an empty successful catalog without an error", () => {
	const h = context();
	expect(printProviderModels(h.ctx, { ...catalog, models: [] }, false)).toBe(0);
	expect(h.out()).toBe("(none)\n");
	expect(h.err()).toBe("");
});

test("prints the whole catalog result in JSON", () => {
	const h = context("json");
	printProviderModels(h.ctx, catalog, false);
	expect(JSON.parse(h.out())).toEqual(catalog);
});

test("prints a failed catalog on stderr and returns exit code one", () => {
	const result: ProviderModels = { ok: false, detail: "The provider refused the key.", models: [], fetchedAt: at };
	for (const mode of ["table", "json"] as const) {
		const h = context(mode);
		expect(printProviderModels(h.ctx, result, false)).toBe(1);
		expect(h.err()).toBe("error: The provider refused the key.\n");
		if (mode === "json") expect(JSON.parse(h.out())).toEqual(result);
		else expect(h.out()).toBe("");
	}
});

test("prints the provider name, balance, refusal, and check time", () => {
	const success: ProviderCheck = { ok: true, balance: "95.50", detail: null, checkedAt: at };
	const h = context();
	printProviderCheck(h.ctx, "id", "Vercel", success);
	expect(h.out()).toContain("provider: Vercel");
	expect(h.out()).toContain("ok:       true");
	expect(h.out()).toContain("balance:  95.50");
	expect(h.out()).toContain("detail:   -");
	expect(h.out()).toContain("checked:");
	const failed = context();
	printProviderCheck(failed.ctx, "id", "Vercel", {
		ok: false,
		balance: null,
		detail: "The provider refused the key.",
		checkedAt: at,
	});
	expect(failed.out()).toContain("detail:   The provider refused the key.");
	const json = context("json");
	printProviderCheck(json.ctx, "id", "Vercel", success);
	expect(JSON.parse(json.out())).toEqual(success);
});

test("the CLI models verb sends refresh and exits one for an HTTP-successful failed result", async () => {
	const h = context("json");
	const id = "01M39A00000000000000000000";
	const result: ProviderModels = { ok: false, detail: "The provider refused the key.", models: [], fetchedAt: at };
	const deps: Deps = {
		fetch: async (request: Request) => {
			const url = new URL(request.url);
			expect(url.pathname).toBe("/rpc/providers/models");
			expect(await request.json()).toEqual({ json: { id, refresh: true } });
			return Response.json({ json: result }, { headers: { "x-trellis-api-version": "0.0.0" } });
		},
		env: { TRELLIS_URL: "http://trellis.test", TRELLIS_ACTOR: "human:Navid" },
		stdout: { ...h.ctx.out, isTTY: false },
		stderr: { ...h.ctx.err, isTTY: false },
		signal: new AbortController().signal,
		apiVersion: "0.0.0",
		stdin: async () => "",
		gitUserName: () => "Navid",
		osUser: () => "Navid",
		now: () => new Date(at),
		sleep: async () => {},
		open: () => {},
		run: async () => ({ code: 0, stderr: "" }),
		launchdDomain: "gui/501",
		home: "/unused",
		which: () => null,
		spawn: () => ({ exited: Promise.resolve(0), kill: () => {} }),
	};
	expect(await run(["provider", "models", id, "--refresh"], deps)).toBe(1);
	expect(JSON.parse(h.out())).toEqual(result);
	expect(h.err()).toBe("error: The provider refused the key.\n");
});
