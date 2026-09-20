import { Play } from "@phosphor-icons/react";
import { useState } from "react";
import { PropertyRow } from "../../../../primitives/PropertyRow";

export type CaptureRun = {
	route: string;
	// The window size of the capture, such as "1440×900".
	viewport: string;
	theme: string;
	// The command that put the screen in the state both images show.
	seed: string;
	browser: string;
	// The SHA of the branch and the SHA it started from, in the length the
	// caller chose.
	headSha: string;
	baseSha: string;
	// The time of the capture, in the words the caller chose.
	capturedAt: string;
};

export type EvidenceShot = {
	// The address the browser reads the bytes from.
	url: string;
	// One sentence from the agent that says what the image shows. The record
	// of a before image and of an after image holds no such sentence yet, so
	// the caller passes null and no sentence prints.
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

// The records a frontend pull request carries: the line that says how the
// screens were taken, the two screens, the clip, the console log and the line
// that names the two commits the screens belong to.
export function FrontendEvidence({ capture, before, after, clip, consoleLine }: FrontendEvidenceProps) {
	return (
		<div className="flex min-w-0 flex-col gap-3">
			{capture !== null && (
				<p className="text-sm text-fg-muted">
					{capture.route} · {capture.viewport} · {capture.theme} · seed: {capture.seed}
				</p>
			)}
			{(before !== null || after !== null) && (
				<div className="grid min-w-0 gap-3 sm:grid-cols-2">
					<Shot label="before" shot={before} />
					<Shot label="after" shot={after} />
				</div>
			)}
			{clip !== null && <Clip clip={clip} />}
			{(consoleLine !== null || capture !== null) && (
				<dl className="flex min-w-0 flex-col">
					{consoleLine !== null && (
						<PropertyRow label="console">
							<span className="min-w-0 text-sm text-fg">{consoleLine}</span>
						</PropertyRow>
					)}
					{capture !== null && (
						<PropertyRow label="record">
							<span className="min-w-0 text-sm text-fg tabular">
								head {capture.headSha} · base {capture.baseSha} · {capture.browser} · {capture.capturedAt}
							</span>
						</PropertyRow>
					)}
				</dl>
			)}
		</div>
	);
}

// One screen at half the width of the strip. The alt text is empty because
// the sentence under the image is the description of the image, and a screen
// reader reads that sentence.
function Shot({ label, shot }: { label: string; shot: EvidenceShot | null }) {
	return (
		<figure className="flex min-w-0 flex-col gap-1">
			<span className="text-sm text-fg-muted">{label}</span>
			{shot === null ? (
				<span className="text-sm text-fg-faint">The agent added no {label} image.</span>
			) : (
				<>
					<img src={shot.url} alt="" className="w-full rounded-sm border border-border" />
					{shot.caption !== null && <figcaption className="text-sm text-fg">{shot.caption}</figcaption>}
				</>
			)}
		</figure>
	);
}

// The clip holds its bytes back until the reader asks for them: the image and
// the video element mount on the click, so the browser sends no request for
// the file before that click.
function Clip({ clip }: { clip: EvidenceClip }) {
	const [plays, setPlays] = useState(false);
	return (
		<figure className="flex min-w-0 flex-col gap-1">
			{plays ? (
				clip.mime.startsWith("video/") ? (
					<video
						src={clip.url}
						autoPlay
						loop
						muted
						playsInline
						controls
						className="w-full rounded-sm border border-border"
					/>
				) : (
					<img src={clip.url} alt="" className="w-full rounded-sm border border-border" />
				)
			) : (
				<button
					type="button"
					onClick={() => setPlays(true)}
					className="flex min-w-0 cursor-pointer items-center gap-2 self-start rounded-sm border border-border px-2 py-1 text-left text-sm text-fg transition-colors duration-hover ease-out hover:bg-band focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
				>
					<Play weight="fill" className="size-3.5 shrink-0 text-fg-muted" />
					<span>Play {clip.filename}</span>
				</button>
			)}
			<figcaption className="text-sm text-fg">{clip.caption}</figcaption>
		</figure>
	);
}
