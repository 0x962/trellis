import { expect, test } from "bun:test";
import { type EpicAutopilot, HarnessSchema } from "@trellis/api";
import { type Deps, run } from "../../../index.ts";

const saved: EpicAutopilot = {
	enabled: true,
	maxConcurrency: 3,
	harness: HarnessSchema.parse({ preset: "codex", model: "openai/gpt-5.6-sol", effort: "high" }),
	accountId: null,
};

function fixture(current: EpicAutopilot | null = saved) {
	const calls: Array<{ path: string; input: unknown }> = [];
	let output = "";
	const deps = {
		env: { TRELLIS_URL: "http://test.local", TRELLIS_ACTOR: "human:Navid" },
		stdout: {
			write: (text: string) => {
				output += text;
			},
			isTTY: false,
		},
		stderr: { write: () => {}, isTTY: false },
		stdin: async () => "",
		gitUserName: () => "Navid",
		osUser: () => "navid",
		now: () => new Date(),
		signal: new AbortController().signal,
		apiVersion: "1",
		fetch: async (request: Request) => {
			const path = new URL(request.url).pathname;
			const input = ((await request.json()) as { json: { autopilot?: EpicAutopilot } }).json;
			calls.push({ path, input });
			return Response.json(
				{ json: path.endsWith("setAutopilot") ? input.autopilot : current },
				{
					headers: { "x-trellis-api-version": "1" },
				},
			);
		},
	} as unknown as Deps;
	return { deps, calls, output: () => output };
}

test("enable sends the chosen limit and launch settings", async () => {
	const h = fixture();
	expect(
		await run(
			[
				"epic",
				"autopilot",
				"enable",
				"AUTO/flight",
				"--max-concurrency",
				"3",
				"--harness",
				"codex",
				"--model",
				"openai/gpt-5.6-sol",
				"--effort",
				"high",
			],
			h.deps,
		),
	).toBe(0);
	expect(h.calls).toEqual([{ path: "/rpc/epics/setAutopilot", input: { epic: "AUTO/flight", autopilot: saved } }]);
	expect(JSON.parse(h.output())).toEqual(saved);
});

test("disable retains the saved launch settings", async () => {
	const h = fixture();
	expect(await run(["epic", "autopilot", "disable", "AUTO/flight"], h.deps)).toBe(0);
	expect(h.calls[1]).toEqual({
		path: "/rpc/epics/setAutopilot",
		input: {
			epic: "AUTO/flight",
			autopilot: { ...saved, enabled: false },
		},
	});
});

test("unconfigured epics read as off and invalid limits send no request", async () => {
	const h = fixture(null);
	expect(await run(["epic", "autopilot", "show", "AUTO/flight"], h.deps)).toBe(0);
	expect(JSON.parse(h.output())).toBeNull();
	const invalid = fixture();
	await expect(
		run(["epic", "autopilot", "enable", "AUTO/flight", "--max-concurrency", "0", "--harness", "codex"], invalid.deps),
	).rejects.toThrow();
	expect(invalid.calls).toEqual([]);
});
