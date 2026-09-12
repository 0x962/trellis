import { Badge } from "../../primitives/Badge";
export function ReviewStatus({ state: value }: { state: string }) {
	const state = value.toUpperCase();
	return (
		<Badge tone={state === "MERGED" ? "agent" : state === "OPEN" ? "ok" : "neutral"} size="sm">
			{state === "MERGED" ? "Merged" : state === "OPEN" ? "Open" : state === "CLOSED" ? "Closed" : "Draft"}
		</Badge>
	);
}
