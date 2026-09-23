import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DoneWash } from "./DoneWash";
import { doneWashMs, waveFillMs } from "./timing";

const css = await Bun.file(new URL("../../tokens.css", import.meta.url)).text();

test("the band fills the row, takes no pointer, and starts clear", () => {
	const html = renderToStaticMarkup(<DoneWash />);

	expect(html).toContain("absolute inset-0");
	expect(html).toContain("pointer-events-none");
	expect(html).toContain("bg-success-soft");
	expect(html).toContain("opacity-0");
	expect(html).toContain('aria-hidden="true"');
});

test("the band animates for the time the caller keeps it on the page", () => {
	const html = renderToStaticMarkup(<DoneWash />);

	expect(doneWashMs).toBe(640);
	expect(html).toContain(`--done-wash-run:${doneWashMs}ms`);
	expect(css).toContain("@utility done-wash {");
	expect(css).toContain("animation: done-wash var(--done-wash-run)");
});

test("the band writes no transform, which the row element owns", () => {
	const wash = css.slice(css.indexOf("@keyframes done-wash {"), css.indexOf("@utility done-wash {"));

	expect(wash).toContain("clip-path");
	expect(wash).toContain("opacity");
	expect(wash).not.toContain("transform");
});

test("the wave fill takes its delay and its duration from the two tokens", () => {
	const delay = css.match(/--delay-wave-fill: (\d+)ms;/)![1]!;
	const duration = css.match(/--duration-wave-fill: (\d+)ms;/)![1]!;

	expect(Number(delay) + Number(duration)).toBe(waveFillMs);
	expect(css).toContain(
		"transition: --status-progress var(--duration-wave-fill) var(--ease-out) var(--delay-wave-fill);",
	);
});
