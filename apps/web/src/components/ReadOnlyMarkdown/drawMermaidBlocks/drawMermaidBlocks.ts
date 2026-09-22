let diagramCount = 0;

// The theme the screen shows now: the data-theme mark on <html>, or the
// system setting when the person chose the system theme.
const shownTheme = (): "dark" | "default" => {
	const chosen = document.documentElement.getAttribute("data-theme");
	if (chosen !== null) return chosen === "dark" ? "dark" : "default";
	return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "default";
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
	mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: shownTheme() });
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
