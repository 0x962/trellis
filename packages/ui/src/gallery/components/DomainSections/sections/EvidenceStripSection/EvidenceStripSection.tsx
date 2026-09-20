import { EvidenceStrip, FrontendEvidence } from "../../../../../review";
import { Section } from "../../../Section";
import beforeScreenshot from "./evidence/op27-send-pending.png";
import clipFile from "./evidence/op27-send-timeout.gif";
import afterScreenshot from "./evidence/op27-send-timeout.png";

// The three files an agent attached to pull request 56930 of the canary
// repository, and the capture record of that same pull request.
const capture = {
	route: "/chat/:uuid",
	viewport: "1440×900",
	theme: "dark",
	seed: "trellis seed op27-stall",
	browser: "Chrome 141",
	headSha: "8b21f0c",
	baseSha: "4c9a771",
	capturedAt: "2026-09-18 01:58",
};

const before = {
	url: beforeScreenshot,
	caption: "The dialog holds both buttons greyed while the post stalls.",
};

const after = {
	url: afterScreenshot,
	caption: "A post that gives up prints its words and the dialog closes.",
};

const clip = {
	url: clipFile,
	filename: "op27-send-timeout.gif",
	caption: "The post stalls, the dialog releases, and the thread decides the mode.",
	mime: "image/gif",
};

const copy = () => {};

export function EvidenceStripSection() {
	return (
		<Section name="EvidenceStrip" note="filled, one record missing, loading, nothing owed" className="items-start">
			<div className="min-w-80 flex-1">
				<EvidenceStrip present={5} required={5} missing={[]} hasRecords={true} note="captured on 8b21f0c" onCopy={copy}>
					<FrontendEvidence
						capture={capture}
						before={before}
						after={after}
						clip={clip}
						consoleLine="op27-console.txt · 2 KB"
					/>
				</EvidenceStrip>
			</div>
			<div className="min-w-80 flex-1">
				<EvidenceStrip
					present={4}
					required={5}
					missing={[{ label: "console list", fillCommand: "trellis evidence add 56930 --kind console --file <path>" }]}
					hasRecords={true}
					note="captured on 8b21f0c"
					onCopy={copy}
				>
					<FrontendEvidence capture={capture} before={before} after={after} clip={null} consoleLine={null} />
				</EvidenceStrip>
			</div>
			<div className="min-w-80 flex-1">
				<EvidenceStrip present={0} required={5} missing={[]} hasRecords={false} loading={true} onCopy={copy} />
			</div>
			<div className="min-w-80 flex-1">
				<EvidenceStrip present={0} required={0} missing={[]} hasRecords={false} onCopy={copy} />
			</div>
		</Section>
	);
}
