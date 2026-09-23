import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CheckConfetti } from "./CheckConfetti";
import { confettiMs, confettiPieces } from "./pieces";

test("throws seven pieces, each with its own drift, turn and start delay", () => {
	const html = renderToStaticMarkup(<CheckConfetti />);

	expect(html.split("data-confetti-piece").length - 1).toBe(7);
	expect(html).toContain("left:14px");
	expect(html).toContain("--confetti-across:-24px");
	expect(html).toContain("--confetti-turn:-286deg");
	expect(html).toContain("animation-delay:0ms");
	expect(html).toContain("animation-delay:156ms");
});

test("colours the pieces with the two greens and the one gold of the token set", () => {
	const html = renderToStaticMarkup(<CheckConfetti />);

	expect(html.split("var(--check-ribbon-pass)").length - 1).toBe(3);
	expect(html.split("var(--success)").length - 1).toBe(2);
	expect(html.split("var(--film-gold)").length - 1).toBe(2);
});

test("the whole effect takes 1056 ms", () => {
	expect(confettiPieces.length).toBe(7);
	expect(confettiMs).toBe(1056);
});
