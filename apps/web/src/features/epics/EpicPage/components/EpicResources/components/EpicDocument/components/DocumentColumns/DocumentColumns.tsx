import { DocumentLayout } from "@trellis/ui";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { type DocumentHeading, observeDocumentHeadings } from "./documentHeadings";

export function DocumentColumns({ margin, children }: { margin: ReactNode; children: ReactNode }) {
	const content = useRef<HTMLElement>(null);
	const scroll = useRef<HTMLDivElement>(null);
	const [headings, setHeadings] = useState<DocumentHeading[] | null>(null);
	const [activeId, setActiveId] = useState<string | null>(null);
	useEffect(() => observeDocumentHeadings(content.current!, setHeadings), []);
	return (
		<DocumentLayout
			contentRef={content}
			scrollRef={scroll}
			margin={margin}
			headings={headings}
			activeId={activeId}
			onSelect={(id) => {
				const heading = headings!.find((item) => item.id === id)!;
				const container = scroll.current!;
				const inset = Number.parseFloat(getComputedStyle(container).paddingTop);
				container.scrollTop +=
					heading.element.getBoundingClientRect().top - container.getBoundingClientRect().top - inset;
				setActiveId(id);
			}}
		>
			{children}
		</DocumentLayout>
	);
}
