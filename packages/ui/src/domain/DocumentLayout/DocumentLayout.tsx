import { List } from "@phosphor-icons/react";
import { type ReactNode, type Ref, useLayoutEffect, useRef, useState } from "react";
import { IconButton } from "../../primitives/IconButton";
import { Popover } from "../../primitives/Popover";
import { DocumentContents, type DocumentContentsProps } from "./components/DocumentContents";

export type DocumentLayoutProps = DocumentContentsProps & {
	children: ReactNode;
	margin: ReactNode;
	contentRef: Ref<HTMLElement>;
	scrollRef: Ref<HTMLDivElement>;
};

export function DocumentLayout({ children, margin, contentRef, scrollRef, ...contents }: DocumentLayoutProps) {
	const region = useRef<HTMLDivElement>(null);
	const [wide, setWide] = useState(false);
	useLayoutEffect(() => {
		const element = region.current!;
		const measure = () => {
			const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
			setWide(element.clientWidth >= 48 * rem);
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	}, []);
	return (
		<div className="flex min-h-0 min-w-0 flex-1">
			<div ref={region} className="flex min-h-0 min-w-0 flex-1">
				<div className="flex min-h-0 min-w-0 flex-1 flex-col">
					{!wide && <ContentsMenu {...contents} />}
					<div
						ref={scrollRef}
						className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-8 py-6 max-md:px-4"
					>
						<article ref={contentRef} className="mx-auto flex max-w-3xl flex-col gap-4">
							{children}
						</article>
					</div>
				</div>
				{wide && (
					<aside className="w-56 shrink-0 overflow-y-auto overscroll-contain border-l border-border px-2 py-3">
						<DocumentContents {...contents} />
					</aside>
				)}
			</div>
			{margin}
		</div>
	);
}

function ContentsMenu({ onSelect, ...contents }: DocumentContentsProps) {
	const [open, setOpen] = useState(false);
	return (
		<div className="flex shrink-0 justify-end border-b border-border px-4 py-2">
			<Popover
				label="Document contents"
				open={open}
				onOpenChange={setOpen}
				align="end"
				triggerTooltip="Contents"
				trigger={<IconButton label="Contents" icon={<List />} />}
				className="max-h-[min(60dvh,var(--available-height))] w-70 max-w-(--available-width) overflow-y-auto overscroll-contain"
			>
				<DocumentContents
					{...contents}
					onSelect={(id) => {
						onSelect(id);
						setOpen(false);
					}}
				/>
			</Popover>
		</div>
	);
}
