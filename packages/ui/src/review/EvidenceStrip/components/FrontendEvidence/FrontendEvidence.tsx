import { Play } from "@phosphor-icons/react";
import { useState } from "react";
import { PropertyRow } from "../../../../primitives/PropertyRow";

export type CaptureRun = {
	route: string | null;
	// The window size of the capture, such as "1440x900" or "390x844".
	viewport: string | null;
	theme: string | null;
	// The command that put the screen in the state both images show.
	seed: string | null;
	browser: string | null;
	// The branch SHA and the SHA the branch started from. The component prints
	// both without a change.
	headSha: string | null;
	baseSha: string | null;
	// The time of the capture. The component prints the text without a change.
	capturedAt: string | null;
};

export type EvidenceShot = {
	url: string;
	// One sentence from the agent that says what the image shows. A null value
	// prints no sentence.
	caption: string | null;
};

export type EvidenceClip = {
	url: string;
	filename: string;
	caption: string;
	// The media type of the file. "video/..." plays in a video element. Every
	// other type draws in an image element, which is how an animated GIF
	// plays.
	mime: string;
};

export type FrontendEvidenceProps = {
	capture: CaptureRun | null;
	before: EvidenceShot | null;
	after: EvidenceShot | null;
	clip: EvidenceClip | null;
	// The words of the console record, such as "op27-console.txt · 2 KB".
	consoleLine: string | null;
};

// A field the record does not hold drops out of its line, so the line never
// prints two separators with nothing between them.
const dotted = (parts: readonly (string | null)[]) => parts.filter((part) => part !== null).join(" · ");

// The shape of the box that holds a screen, taken from the viewport of the
// capture. The box keeps that shape before the file arrives, so the lines
// under it stay where they are when the bytes come in. A record without a
// readable viewport, and a pull request without a capture record, get the
// shape of a 1440x900 desktop window.
const desktopRatio = "16 / 10";
const boxRatio = (viewport: string | null) => {
	const sides = (viewport ?? "").split(/[x×]/).map(Number);
	return sides.length === 2 && sides.every((side) => side > 0) ? sides.join(" / ") : desktopRatio;
};

export function FrontendEvidence({ capture, before, after, clip, consoleLine }: FrontendEvidenceProps) {
	const ratio = boxRatio(capture?.viewport ?? null);
	const captureLine =
		capture === null
			? ""
			: dotted([capture.route, capture.viewport, capture.theme, capture.seed && `seed: ${capture.seed}`]);
	const recordLine =
		capture === null
			? ""
			: dotted([
					capture.headSha && `head ${capture.headSha}`,
					capture.baseSha && `base ${capture.baseSha}`,
					capture.browser,
					capture.capturedAt,
				]);

	return (
		<div className="flex min-w-0 flex-col gap-3">
			{captureLine !== "" && <p className="text-sm text-fg-muted">{captureLine}</p>}
			{(before !== null || after !== null) && (
				<div className="grid min-w-0 gap-3 sm:grid-cols-2">
					<Shot label="before" ratio={ratio} shot={before} />
					<Shot label="after" ratio={ratio} shot={after} />
				</div>
			)}
			{clip !== null && <Clip clip={clip} ratio={ratio} />}
			{(consoleLine !== null || recordLine !== "") && (
				<dl className="flex min-w-0 flex-col">
					{consoleLine !== null && (
						<PropertyRow label="console">
							<span className="min-w-0 text-sm text-fg">{consoleLine}</span>
						</PropertyRow>
					)}
					{recordLine !== "" && (
						<PropertyRow label="record">
							<span className="min-w-0 text-sm text-fg tabular">{recordLine}</span>
						</PropertyRow>
					)}
				</dl>
			)}
		</div>
	);
}

// The alt text is the sentence the agent wrote, or the word "before" or
// "after" when the agent wrote no sentence, so a screen reader always reads
// words for the screen.
function Shot({ label, ratio, shot }: { label: string; ratio: string; shot: EvidenceShot | null }) {
	return (
		<figure className="flex min-w-0 flex-col gap-1">
			<span className="text-sm text-fg-muted">{label}</span>
			{shot === null ? (
				<span className="text-sm text-fg-faint">The agent added no {label} image.</span>
			) : (
				<>
					<div className="w-full overflow-hidden rounded-sm border border-border" style={{ aspectRatio: ratio }}>
						<img src={shot.url} alt={shot.caption ?? `the ${label} screen`} className="size-full object-contain" />
					</div>
					{shot.caption !== null && <figcaption className="text-sm text-fg">{shot.caption}</figcaption>}
				</>
			)}
		</figure>
	);
}

// The img and the video element mount on the click. The browser requests the
// file only after that click. The box around them holds its size from the
// first render, so the click moves no line of the page.
function Clip({ clip, ratio }: { clip: EvidenceClip; ratio: string }) {
	const [plays, setPlays] = useState(false);
	return (
		<figure className="flex min-w-0 flex-col gap-1">
			<div
				className="flex w-full items-center justify-center overflow-hidden rounded-sm border border-border"
				style={{ aspectRatio: ratio }}
			>
				{plays ? (
					clip.mime.startsWith("video/") ? (
						<video src={clip.url} autoPlay loop muted playsInline controls className="size-full object-contain" />
					) : (
						<img src={clip.url} alt={clip.caption} className="size-full object-contain" />
					)
				) : (
					<button
						type="button"
						onClick={() => setPlays(true)}
						className="flex min-w-0 cursor-pointer items-center gap-2 rounded-sm border border-border px-2 py-1 text-left text-sm text-fg transition-colors duration-hover ease-out hover:bg-band focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
					>
						<Play weight="fill" className="size-3.5 shrink-0 text-fg-muted" />
						<span>Play {clip.filename}</span>
					</button>
				)}
			</div>
			<figcaption className="text-sm text-fg">{clip.caption}</figcaption>
		</figure>
	);
}
