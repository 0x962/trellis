import { encode } from "uqr";

// The light margin around the code, in modules. A camera needs it to find
// the edge of the code.
const QUIET_ZONE = 4;

export type PairQrProps = {
	link: string;
};

// A QR code of `link` as one SVG path, one unit square per dark module.
export function PairQr({ link }: PairQrProps) {
	const { data, size } = encode(link, { ecc: "M", border: 0 });
	const squares = data.flatMap((row, y) => row.flatMap((dark, x) => (dark ? [`M${x} ${y}h1v1h-1z`] : []))).join("");
	const side = size + QUIET_ZONE * 2;
	return (
		<svg
			role="img"
			aria-label={`QR code for ${link}`}
			viewBox={`${-QUIET_ZONE} ${-QUIET_ZONE} ${side} ${side}`}
			shapeRendering="crispEdges"
			className="size-40 shrink-0 rounded-md bg-qr-paper"
		>
			<path d={squares} className="fill-qr-ink" />
		</svg>
	);
}
