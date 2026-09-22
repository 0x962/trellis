let diagramCount = 0;

const token = (style: CSSStyleDeclaration, name: string): string => style.getPropertyValue(name).trim();

const darkMode = (): boolean => {
	const chosen = document.documentElement.getAttribute("data-theme");
	if (chosen !== null) return chosen === "dark";
	return window.matchMedia("(prefers-color-scheme: dark)").matches;
};

const themeVariables = () => {
	const style = getComputedStyle(document.documentElement);
	return {
		background: "transparent",
		darkMode: darkMode(),
		edgeLabelBackground: token(style, "--surface"),
		fontFamily: token(style, "--sans"),
		lineColor: token(style, "--fg-muted"),
		mainBkg: token(style, "--surface"),
		primaryBorderColor: token(style, "--border-strong"),
		primaryColor: token(style, "--surface"),
		primaryTextColor: token(style, "--fg"),
		secondaryBorderColor: token(style, "--border"),
		secondaryColor: token(style, "--bg"),
		secondaryTextColor: token(style, "--fg"),
		tertiaryBorderColor: token(style, "--border"),
		tertiaryColor: token(style, "--bg"),
		tertiaryTextColor: token(style, "--fg"),
	};
};

// Replaces each ```mermaid code block under `root` with the diagram it
// describes, such as a flowchart or an xychart-beta chart. The mermaid
// package is large, so the page loads it only when a text holds a diagram.
// The strict security level renders every label as text and runs no click
// handler. The text comes from an agent, so a block that mermaid cannot
// parse stays on the page as code.
export const drawMermaidBlocks = async (root: HTMLElement): Promise<void> => {
	const blocks = [...root.querySelectorAll("pre > code.language-mermaid")];
	if (blocks.length === 0) return;
	const { default: mermaid } = await import("mermaid");
	mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "base", themeVariables: themeVariables() });
	for (const code of blocks) {
		diagramCount += 1;
		const id = `mermaid-diagram-${diagramCount}`;
		try {
			const { svg } = await mermaid.render(id, code.textContent ?? "");
			const figure = document.createElement("figure");
			figure.className = "mermaid-diagram";
			figure.innerHTML = svg;
			code.parentElement!.replaceWith(figure);
		} catch {
			// Mermaid leaves its scratch element in the body when a parse fails.
			document.getElementById(`d${id}`)?.remove();
		}
	}
};
