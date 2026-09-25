import { ArrowSquareOut } from "@phosphor-icons/react";
import type { ReactElement, ReactNode } from "react";
import { CodeText } from "../../primitives/CodeText";
import { IconButton } from "../../primitives/IconButton";
import { PropertyRow } from "../../primitives/PropertyRow";
import { SectionHeader } from "../../primitives/SectionHeader";
import { Tooltip } from "../../primitives/Tooltip";

export type PageVersionRowProps = {
	number: number;
	label: string | null;
	actor: string;
	sourcePath: string;
	sha256: string;
	bytes: number;
	publishedAt: string;
	selected: boolean;
	link: ReactElement<{ className?: string; children?: ReactNode }>;
};

export function PageVersionRow({
	number,
	label,
	actor,
	sourcePath,
	sha256,
	bytes,
	publishedAt,
	selected,
	link,
}: PageVersionRowProps) {
	return (
		<li className="border-b border-border px-5 py-2">
			<SectionHeader
				level={3}
				title={`Version ${number}${label ? `: ${label}` : ""}${selected ? " (selected)" : ""}`}
				actions={
					<Tooltip content={`Open version ${number}`}>
						<IconButton label={`Open version ${number}`} icon={<ArrowSquareOut />} render={link} />
					</Tooltip>
				}
			/>
			<dl className="text-sm">
				<PropertyRow label="Published">
					<time dateTime={publishedAt}>{new Date(publishedAt).toLocaleString()}</time>
				</PropertyRow>
				<PropertyRow label="Actor">
					<span className="break-all">{actor}</span>
				</PropertyRow>
				<PropertyRow label="Source">
					<span className="break-all">{sourcePath}</span>
				</PropertyRow>
				<PropertyRow label="SHA-256">
					<CodeText className="break-all text-xs">{sha256}</CodeText>
				</PropertyRow>
				<PropertyRow label="Size">
					<span className="tabular">{bytes.toLocaleString()} bytes</span>
				</PropertyRow>
			</dl>
		</li>
	);
}
