import { useState } from "react";
import { Button } from "../../primitives/Button";
import { PropertyRow } from "../../primitives/PropertyRow";

export type CaptureRun = {
	route: string | null;
	// The window size of the capture, such as "1440x900" or "390x844".
	viewport: string | null;
	theme: string | null;
	// The command that put the screen in the state both screenshots show.
	seed: string | null;
	browser: string | null;
	// The branch SHA and the SHA the branch started from. The component prints
	// both without a change.
	headSha: string | null;
	baseSha: string | null;
	// The time of the capture. The component prints the text without a change.
	capturedAt: string | null;
};

export type EvidenceScreenshot = {
	url: string;
	// One sentence from the agent that says what the screenshot shows. A null
	// value prints no sentence.
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
	before: EvidenceScreenshot | null;
	after: EvidenceScreenshot | null;
	clip: EvidenceClip | null;
	// The words of the console record, such as "op27-console.txt · 2.0 KB".
	consoleLine: string | null;
};

// A field the record does not hold drops out of its line, so the line never
// prints two separators with nothing between them.
const dotted = (parts: readonly (string | null)[]) => parts.filter((part) => part !== null).join(" · ");

// The shape of the box that holds a screenshot, taken from the viewport of
// the capture. The box keeps that shape before the file arrives, so the lines
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
					<Screenshot label="before" ratio={ratio} screenshot={before} />
					<Screenshot label="after" ratio={ratio} screenshot={after} />
				</div>
			)}
			{clip !== null && <Clip clip={clip} ratio={ratio} />}
			{(consoleLine !== null || recordLine !== "") && (
				<dl className="flex min-w-0 flex-col">
					{consoleLine !== null && (
						<PropertyRow label="console">
							<span className="min-w-0">{consoleLine}</span>
						</PropertyRow>
					)}
					{recordLine !== "" && (
						<PropertyRow label="record">
							<span className="min-w-0 tabular">{recordLine}</span>
						</PropertyRow>
					)}
				</dl>
			)}
		</div>
	);
}

// The alt text is the sentence the agent wrote, or the word "before" or
// "after" when the agent wrote no sentence, so a screen reader always reads
// words for the screenshot.
function Screenshot({
	label,
	ratio,
	screenshot,
}: {
	label: string;
	ratio: string;
	screenshot: EvidenceScreenshot | null;
}) {
	return (
		<figure className="flex min-w-0 flex-col gap-1">
			<span className="text-sm text-fg-muted">{label}</span>
			{screenshot === null ? (
				<span className="text-sm text-fg-faint">The agent added no {label} screenshot.</span>
			) : (
				<>
					<div className="w-full overflow-hidden rounded-md border border-border" style={{ aspectRatio: ratio }}>
						<img
							src={screenshot.url}
							alt={screenshot.caption ?? `the ${label} screenshot`}
							className="size-full object-contain"
						/>
					</div>
					{screenshot.caption !== null && <figcaption className="text-sm text-fg">{screenshot.caption}</figcaption>}
				</>
			)}
		</figure>
	);
}

// The img and the video element mount on the click. The browser requests the
// file only after that click. The box around them holds its size from the
// first render, so the click moves no line of the page.
function Clip({ clip, ratio }: { clip: EvidenceClip; ratio: string }) {
	const [started, setStarted] = useState(false);
	return (
		<figure className="flex min-w-0 flex-col gap-1">
			<div
				className="flex w-full items-center justify-center overflow-hidden rounded-md border border-border"
				style={{ aspectRatio: ratio }}
			>
				{started ? (
					clip.mime.startsWith("video/") ? (
						<video src={clip.url} autoPlay loop muted playsInline controls className="size-full object-contain" />
					) : (
						<img src={clip.url} alt={clip.caption} className="size-full object-contain" />
					)
				) : (
					<Button size="sm" onClick={() => setStarted(true)}>
						Play {clip.filename}
					</Button>
				)}
			</div>
			<figcaption className="text-sm text-fg">{clip.caption}</figcaption>
		</figure>
	);
}
