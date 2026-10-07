import { Badge } from "@trellis/ui";
import type { FlowDiscoveryEntry } from "../../../../../../flowDiscovery";

export function PublicationBadge({ entry }: { entry: FlowDiscoveryEntry }) {
	if (entry.document.engine === "legacy") return <Badge>No publication needed</Badge>;
	switch (entry.document.publication.state) {
		case "published":
			return <Badge tone="ok">Published</Badge>;
		case "pending":
			return <Badge tone="wait">Publication pending</Badge>;
		case "failed":
			return <Badge tone="bad">Publication failed</Badge>;
		case "blocked":
			return <Badge tone="bad">Publication blocked</Badge>;
		case "not_requested":
			return <Badge>Not published</Badge>;
	}
}
