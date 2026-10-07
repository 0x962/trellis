import { flowProjectLabel } from "@trellis/api";
import { Badge } from "@trellis/ui";
import type { FlowDiscoveryEntry } from "../../../../flowDiscovery";
import { CompatibilityBadge } from "./components/CompatibilityBadge";
import { PublicationBadge } from "./components/PublicationBadge";

export function FlowCardBadges({ entry }: { entry: FlowDiscoveryEntry }) {
	return (
		<>
			<Badge>{flowProjectLabel(entry.document.flow)}</Badge>
			<Badge>{entry.document.engine === "legacy" ? "Legacy" : "Langflow"}</Badge>
			<Badge>Version {entry.document.revision}</Badge>
			<PublicationBadge entry={entry} />
			<CompatibilityBadge entry={entry} />
		</>
	);
}
