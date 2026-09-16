export type PersonaKind = "manager" | "builder" | "reviewer";
export type PersonaState = "static" | "working-mild" | "working";

export const trellisLines = ["M13 8 24 19", "M19 24 8 13", "M8 19 19 8", "M24 13 13 24"];
export const boxLines = ["M5 7H27", "M25 5V27", "M27 25H5", "M7 27V5"];

const codes: Record<string, string> = {
	builder: "B",
	reviewer: "R",
	"risk-based code review": "RR",
	"business logic separation": "BL",
	"backend review scope": "BE",
	"frontend review scope": "FE",
	"code comment clarity": "CC",
	"code naming clarity": "NC",
	"database migration safety": "DM",
	"design token consistency": "DT",
	"file and folder structure": "FS",
	"hidden fallback detection": "HF",
	"module layout compliance": "ML",
	"pull request context": "PR",
	"rest api design": "AP",
	"readability review scope": "RD",
	"render performance": "RP",
	"service boundaries": "SB",
	"shared component reuse": "SC",
	"structured logging": "SL",
	"unused code detection": "UC",
};

export function personaAppearance(name: string, kind?: PersonaKind) {
	const key = name.trim().toLowerCase();
	return {
		kind: kind ?? (key === "trellis" || key === "manager" ? "manager" : key === "builder" ? "builder" : "reviewer"),
		letters:
			codes[key] ??
			key
				.split(/[\s-]+/)
				.slice(0, 2)
				.map((word) => word.charAt(0))
				.join("")
				.toUpperCase(),
	};
}
