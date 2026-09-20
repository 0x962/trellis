// The shape of a box that holds a picture of a 1440x900 desktop window. A
// record without a readable window size takes this shape.
export const desktopRatio = "16 / 10";

export type EvidenceFigureProps = {
	url: string;
	// What a screen reader reads for the picture.
	alt: string;
	// One sentence under the picture. Null prints no sentence.
	caption: string | null;
	// The shape of the box, such as "1440 / 900". The box holds that shape
	// before the file arrives, so the lines under it stay where they are when
	// the bytes come in.
	ratio: string;
	// A word above the box, such as "before".
	label?: string;
};

export function EvidenceFigure({ url, alt, caption, ratio, label }: EvidenceFigureProps) {
	return (
		<figure className="flex min-w-0 flex-col gap-1">
			{label !== undefined && <span className="text-sm text-fg-muted">{label}</span>}
			<div className="w-full overflow-hidden rounded-md border border-border" style={{ aspectRatio: ratio }}>
				<img src={url} alt={alt} className="size-full object-contain" />
			</div>
			{caption !== null && <figcaption className="text-sm text-fg">{caption}</figcaption>}
		</figure>
	);
}
