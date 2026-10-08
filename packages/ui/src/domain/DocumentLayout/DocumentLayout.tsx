import { type ReactNode, type Ref, useLayoutEffect, useRef, useState } from "react";
import { ContentsMenu } from "./components/ContentsMenu";
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
			const style = getComputedStyle(document.documentElement);
			const minimum = Number.parseFloat(style.getPropertyValue("--container-3xl")) * Number.parseFloat(style.fontSize);
			setWide(element.clientWidth >= minimum);
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
					<aside className="flex min-h-0 w-56 shrink-0 flex-col border-l border-border px-2 py-3">
						<DocumentContents {...contents} />
					</aside>
				)}
			</div>
			{margin}
		</div>
	);
}
