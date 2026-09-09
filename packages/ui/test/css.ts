import { join } from "node:path";

// One top-level piece of a stylesheet, in source order. A statement is an
// at-rule without a body (`@import "x";`). A block keeps the declarations
// written directly inside it and the blocks nested in it, so a `@media` rule
// holds the `:root` rule it wraps as a child.
export type Piece = {
	prelude: string;
	statement: boolean;
	declarations: Record<string, string>;
	children: Piece[];
};

export const collapse = (text: string) => text.replace(/\s+/g, " ").trim();

// Reads one nesting level from `css` at `start`. Stops after the closing brace
// of the enclosing block, or at the end of the text.
const readLevel = (css: string, start: number) => {
	const pieces: Piece[] = [];
	const declarations: Record<string, string> = {};
	let index = start;
	while (index < css.length) {
		index += css.slice(index).match(/^\s*/)![0].length;
		if (index >= css.length) break;
		if (css[index] === "}") return { pieces, declarations, end: index + 1 };
		const stop = css.slice(index).search(/[{;}]/);
		if (stop === -1) break;
		const head = css.slice(index, index + stop);
		const delimiter = css[index + stop];
		if (delimiter === "{") {
			const inner = readLevel(css, index + stop + 1);
			pieces.push({
				prelude: collapse(head),
				statement: false,
				declarations: inner.declarations,
				children: inner.pieces,
			});
			index = inner.end;
			continue;
		}
		if (head.trim().startsWith("@")) {
			pieces.push({ prelude: collapse(head), statement: true, declarations: {}, children: [] });
		} else if (head.includes(":")) {
			const colon = head.indexOf(":");
			declarations[head.slice(0, colon).trim()] = collapse(head.slice(colon + 1));
		}
		index += stop + (delimiter === ";" ? 1 : 0);
	}
	return { pieces, declarations, end: index };
};

export const parseCss = (css: string) => readLevel(css.replace(/\/\*[\s\S]*?\*\//g, ""), 0).pieces;

export const blocks = (pieces: Piece[]) => pieces.filter((piece) => !piece.statement);

export const statements = (pieces: Piece[]) => pieces.filter((piece) => piece.statement);

export const findBlock = (pieces: Piece[], prelude: string) => {
	const wanted = collapse(prelude);
	return blocks(pieces).find((piece) => piece.prelude === wanted)!;
};

// The three palette blocks every theme-aware stylesheet in this repo carries.
export const paletteBlocks = (pieces: Piece[]) => ({
	light: findBlock(pieces, ":root"),
	darkMedia: findBlock(
		findBlock(pieces, "@media (prefers-color-scheme: dark)").children,
		':root:not([data-theme="light"])',
	),
	darkStamp: findBlock(pieces, ':root[data-theme="dark"]'),
});

export const packageRoot = join(import.meta.dir, "..");

export const repoRoot = join(packageRoot, "..", "..");

export const readSource = (relativePath: string) => Bun.file(join(packageRoot, "src", relativePath)).text();

// The approved look. Its `<style>` element carries the palette that
// tokens.css must copy verbatim.
export const mockupStyle = async () => {
	const html = await Bun.file(join(repoRoot, "docs", "design", "mockup.html")).text();
	return parseCss(html.match(/<style>([\s\S]*?)<\/style>/)![1]!);
};
