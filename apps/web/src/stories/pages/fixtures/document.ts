import { documentResource } from "./resources";

export const documentHeadingNames = [
	"Acceptance plan",
	"Required states",
	"Keyboard access",
	"Pointer targets",
	"Long content",
	"Saved proof",
];

export const documentMarkdown = [
	"# Acceptance plan",
	"Review the complete epic document at desktop and phone widths.",
	"## Required states",
	"The ticket identifier remains visible.",
	"The controls support keyboard access.",
	...Array.from(
		{ length: 12 },
		(_, index) =>
			`Check ${index + 1}. Keep the document readable while its contents list and comment pane remain available. Select each section with the keyboard and verify its position in the document.`,
	),
	"### Keyboard access",
	"Use Tab to reach the contents list. Use Enter to select a heading.",
	"#### Pointer targets",
	"Check each contents row at desktop and phone widths.",
	"##### Long content",
	"Keep the comment pane beside the document when sufficient space is available.",
	"###### Saved proof",
	...Array.from(
		{ length: 8 },
		(_, index) => `Evidence ${index + 1}. Record the exact story name, the observed result, and the viewport width.`,
	),
].join("\n\n");

export const documentWithContents = { ...documentResource, body: documentMarkdown };
