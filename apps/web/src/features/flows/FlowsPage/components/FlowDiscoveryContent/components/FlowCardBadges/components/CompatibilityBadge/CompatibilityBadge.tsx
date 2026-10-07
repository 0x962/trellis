import { Badge } from "@trellis/ui";
import type { FlowDiscoveryEntry } from "../../../../../../flowDiscovery";

export function CompatibilityBadge({ entry }: { entry: FlowDiscoveryEntry }) {
	switch (entry.compatibility.state) {
		case "needs_migration":
			return <Badge tone="wait">Needs migration</Badge>;
		case "blocked":
			return <Badge tone="bad">Conversion blocked</Badge>;
		case "compatible":
		case "unknown":
			return null;
	}
}
