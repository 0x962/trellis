import { describe, expect, test } from "bun:test";
import type { EpicSummary } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { EpicPageContext } from "./EpicPageContext";

const counts = { total: 7, todo: 2, started: 1, review: 1, done: 2, canceled: 1 };
const currentWave = { id: "wave", ref: "DEMO/quality/craft", name: "Craft" };
const context = (values: Partial<EpicSummary> = {}) =>
	({
		counts,
		currentWave,
		currentWaveIndex: 2,
		waveCount: 4,
		state: "open",
		...values,
	}) as EpicSummary;
const render = (epic?: EpicSummary, pending = false) =>
	renderToStaticMarkup(<EpicPageContext name="A complete interface title" epic={epic} pending={pending} />);

describe("EpicPageContext", () => {
	test("prints ticket progress and the current wave", () => {
		const html = render(context());
		expect(html).toContain("2 of 6 tickets done");
		expect(html).toContain("Current wave: Craft \u00b7 2 of 4");
	});

	test("uses one ticket for a one-ticket epic", () => {
		const html = render(
			context({
				counts: { total: 1, todo: 0, started: 0, review: 0, done: 1, canceled: 0 },
				currentWave: null,
				currentWaveIndex: null,
				waveCount: 1,
				state: "done",
			}),
		);
		expect(html).toContain("1 of 1 ticket done");
		expect(html).toContain("All waves complete");
	});

	test("distinguishes no waves from completed and canceled waves", () => {
		expect(
			render(context({ currentWave: null, currentWaveIndex: null, waveCount: 0, counts: { ...counts, total: 0 } })),
		).toContain("No waves");
		expect(render(context({ currentWave: null, currentWaveIndex: null, state: "done" }))).toContain(
			"All waves complete",
		);
		expect(render(context({ currentWave: null, currentWaveIndex: null, state: "canceled" }))).toContain(
			"Epic canceled",
		);
	});

	test("keeps the complete name in the phone title row", () => {
		const html = render(context());
		expect(html).toContain("data-epic-phone-name");
		expect(html).toContain("A complete interface title");
		expect(html).not.toContain("truncate");
	});

	test("keeps the progress row while data loads or fails", () => {
		expect(render(undefined, true)).toContain("aria-busy");
		expect(render()).toContain("Progress unavailable");
	});
});
