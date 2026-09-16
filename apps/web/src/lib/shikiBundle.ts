export const bundledLanguages = {};

type Theme = {
	name: string;
	type?: string;
	fg?: string;
	bg?: string;
	colors?: Record<string, string>;
};

type TextNode = { type: "text"; value: string };
type Element = {
	type: "element";
	tagName: string;
	properties: Record<string, unknown>;
	children: Array<Element | TextNode>;
};
type Root = { type: "root"; children: Element[] };
type Decoration = {
	start: { line: number; character: number };
	end: { line: number; character: number };
	properties: Record<string, unknown>;
};
type Transformer = {
	line?: (node: Element, line: number) => Element | void;
	code?: (node: Element) => Element | void;
	pre?: (node: Element) => Element | void;
	root?: (node: Root) => Root | void;
};

const normalizedTheme = (theme: Theme): Theme => ({
	...theme,
	fg: theme.fg ?? theme.colors?.["editor.foreground"],
	bg: theme.bg ?? theme.colors?.["editor.background"],
});

const decoratedLine = (value: string, line: number, decorations: Decoration[]): Array<Element | TextNode> => {
	const children: Array<Element | TextNode> = [];
	let cursor = 0;
	for (const decoration of decorations) {
		if (decoration.start.line !== line || decoration.end.line !== line) continue;
		if (decoration.start.character > cursor) {
			children.push({ type: "text", value: value.slice(cursor, decoration.start.character) });
		}
		children.push({
			type: "element",
			tagName: "span",
			properties: decoration.properties,
			children: [{ type: "text", value: value.slice(decoration.start.character, decoration.end.character) }],
		});
		cursor = decoration.end.character;
	}
	if (cursor < value.length || children.length === 0) children.push({ type: "text", value: value.slice(cursor) });
	return children;
};

export async function createHighlighter(_options: { langs: unknown[]; themes: unknown[]; engine?: unknown }) {
	const themes = new Map<string, Theme>();
	return {
		loadLanguageSync() {},
		loadThemeSync(theme: Theme) {
			themes.set(theme.name, normalizedTheme(theme));
		},
		getTheme(name: string) {
			return themes.get(name)!;
		},
		codeToHast(code: string, options: { transformers?: Transformer[]; decorations?: Decoration[] }): Root {
			const transformers = options.transformers ?? [];
			const lines = code.split("\n").map((value, index) => {
				let line: Element = {
					type: "element",
					tagName: "span",
					properties: { class: "line" },
					children: decoratedLine(value, index, options.decorations ?? []),
				};
				for (const transformer of transformers) line = transformer.line?.(line, index + 1) ?? line;
				return line;
			});
			let codeNode: Element = { type: "element", tagName: "code", properties: {}, children: lines };
			for (const transformer of transformers) codeNode = transformer.code?.(codeNode) ?? codeNode;
			let pre: Element = { type: "element", tagName: "pre", properties: {}, children: [codeNode] };
			for (const transformer of transformers) pre = transformer.pre?.(pre) ?? pre;
			let root: Root = { type: "root", children: [pre] };
			for (const transformer of transformers) root = transformer.root?.(root) ?? root;
			return root;
		},
		dispose() {},
	};
}

export const createJavaScriptRegexEngine = () => ({});
export const createOnigurumaEngine = () => ({});
export const createCssVariablesTheme = (theme: Theme) => theme;
export const getTokenStyleObject = () => ({});
export const stringifyTokenStyle = (style: string | Record<string, string>) =>
	typeof style === "string" ? style : Object.entries(style).map(([key, value]) => `${key}:${value}`).join(";");
export const codeToHtml = () => "";
