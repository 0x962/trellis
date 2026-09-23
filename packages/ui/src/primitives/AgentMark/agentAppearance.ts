export type AgentMarkKind = "agent" | "trellis";
/*
 * How a mark of an agent draws. `static` is a mark at rest. `starting` is a
 * run that Trellis accepted while the harness has not reported anything yet:
 * the mark dims and brightens in place. `working` is a run that does
 * something now: the band of light crosses the mark.
 */
export type AgentMarkState = "static" | "starting" | "working";

export const trellisLines = ["M13 8 24 19", "M19 24 8 13", "M8 19 19 8", "M24 13 13 24"];
export const boxLines = ["M5 7H27", "M25 5V27", "M27 25H5", "M7 27V5"];

export function agentAppearance(name: string, kind?: AgentMarkKind) {
	const key = name.trim().toLowerCase();
	return {
		kind: kind ?? (key === "trellis" ? "trellis" : "agent"),
		letters: key
			.split(/[\s-]+/)
			.slice(0, 2)
			.map((word) => word.charAt(0))
			.join("")
			.toUpperCase(),
	};
}
