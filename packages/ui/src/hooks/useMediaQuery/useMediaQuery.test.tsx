import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { useMediaQuery } from "./useMediaQuery";

function Match({ query }: { query: string | (() => string) }) {
	return <span>{String(useMediaQuery(query))}</span>;
}

test("a server render does not resolve a browser media query", () => {
	let reads = 0;
	const html = renderToStaticMarkup(
		<Match
			query={() => {
				reads++;
				return "(width < 48rem)";
			}}
		/>,
	);
	expect(reads).toBe(0);
	expect(html).toContain("false");
});

test("a string query preserves the server layout", () => {
	expect(renderToStaticMarkup(<Match query="(pointer: coarse)" />)).toContain("false");
});
