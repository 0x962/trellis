import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CheckConfetti } from "./CheckConfetti";

const css = await Bun.file(new URL("../../tokens.css", import.meta.url)).text();
const html = renderToStaticMarkup(<CheckConfetti />);

// The animation runs from two `@utility` rules, and each rule reads custom
// properties that only a piece sets. A theme token cannot hold this
// animation: a token is one value for the whole page, and a `var()` in it
// that the page root does not define makes the token invalid everywhere, so
// nothing animates and no test of the markup notices.
test("the two animation classes exist as utilities and their keyframes exist", () => {
	for (const name of ["confetti-drift", "confetti-arc"]) {
		expect(html).toContain(`${name} `);
		expect(css).toContain(`@utility ${name} {`);
		expect(css).toContain(`@keyframes ${name} {`);
	}
	expect(css).not.toContain("--animate-confetti");
});

test("every confetti custom property the stylesheet reads is set on a piece", () => {
	const used = new Set([...css.matchAll(/var\((--confetti-[a-z-]+)\)/g)].map((match) => match[1]!));
	expect(used.size).toBe(3);
	for (const name of used) expect(html).toContain(`${name}:`);
});
