export type DocumentHeading = {
	id: string;
	level: number;
	text: string;
	element: HTMLElement;
};

export function observeDocumentHeadings(root: HTMLElement, onChange: (headings: DocumentHeading[] | null) => void) {
	const identities = new WeakMap<HTMLElement, string>();
	let nextId = 0;
	let previous: DocumentHeading[] | null = null;
	const read = () => {
		const markdown = root.querySelector(".markdown");
		if (markdown === null) {
			if (previous !== null) onChange(null);
			previous = null;
			return;
		}
		const headings = Array.from(markdown.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"), (element) => {
			let id = identities.get(element);
			if (id === undefined) {
				id = `heading-${nextId++}`;
				identities.set(element, id);
			}
			return {
				id,
				level: Number(element.tagName.slice(1)),
				text: element.textContent.trim(),
				element,
			};
		});
		if (
			previous !== null &&
			headings.length === previous.length &&
			headings.every((heading, index) => {
				const prior = previous![index]!;
				return heading.id === prior.id && heading.level === prior.level && heading.text === prior.text;
			})
		) {
			return;
		}
		previous = headings;
		onChange(headings);
	};
	const observer = new MutationObserver(read);
	observer.observe(root, { childList: true, characterData: true, subtree: true });
	read();
	return () => observer.disconnect();
}
