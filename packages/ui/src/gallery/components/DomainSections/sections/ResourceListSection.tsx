import { ResourceList, type ResourceRowValue } from "../../../../domain/ResourceList";
import { Section } from "../../Section";

// The resources of the Routines E2E epic. Section 2, screen 8 of
// docs/research/trellis-for-one-human-and-many-agents.md holds these words.
const rows: ResourceRowValue[] = [
	{
		id: "1",
		kind: "doc",
		name: "The routine runtime",
		detail: "edited Sep 19 by crisp-fjord",
		pullRequest: null,
	},
	{
		id: "2",
		kind: "doc",
		name: "Routines E2E plan",
		detail: "edited Sep 19 by you",
		pullRequest: null,
	},
	{
		id: "3",
		kind: "link",
		name: "canary#55569",
		detail: "github.com · opens in the in-app browser",
		pullRequest: null,
	},
	{
		id: "4",
		kind: "image",
		name: "op27-send-timeout.gif",
		detail: "55.0 KB",
		pullRequest: 56930,
	},
	{
		id: "5",
		kind: "file",
		name: "settle-sequence.mmd",
		detail: "1.2 KB",
		pullRequest: 57055,
	},
];

const controls = { onOpen: () => {}, onAddDoc: () => {}, onAddLink: () => {}, onAddFile: () => {} };

export function ResourceListSection() {
	return (
		<Section
			name="ResourceList"
			note="five resources, an epic with none, the wait, and a failed read"
			className="items-start"
		>
			<div className="min-w-96 flex-1">
				<ResourceList rows={rows} {...controls} />
			</div>
			<div className="min-w-96 flex-1">
				<ResourceList rows={[]} {...controls} />
			</div>
			<div className="min-w-96 flex-1">
				<ResourceList rows={[]} loading {...controls} />
			</div>
			<div className="min-w-96 flex-1">
				<ResourceList rows={[]} error="The server did not answer." {...controls} />
			</div>
		</Section>
	);
}
