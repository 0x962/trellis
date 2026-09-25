import type { ReactNode, Ref } from "react";
import { Spinner } from "../../primitives/Spinner";

export type PageViewerProps = {
	title: string;
	version: number;
	frameUrl: string | null;
	frameRef: Ref<HTMLIFrameElement>;
	pending: boolean;
	status: string;
	error?: ReactNode;
};

export function PageViewer({ title, version, frameUrl, frameRef, pending, status, error }: PageViewerProps) {
	return (
		<section aria-label="Page viewer" className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
			<div role="status" aria-live="polite" className="sr-only">
				{status}
			</div>
			{error}
			{pending && (
				<div role="status" className="absolute inset-0 flex items-center justify-center bg-surface pointer-events-none">
					<Spinner />
					<span className="sr-only">Load Page</span>
				</div>
			)}
			{frameUrl !== null && (
				<iframe
					key={frameUrl}
					ref={frameRef}
					src={frameUrl}
					title={`${title}, version ${version}`}
					sandbox="allow-scripts"
					referrerPolicy="no-referrer"
					className="block min-h-0 w-full flex-1 border-0"
				/>
			)}
		</section>
	);
}
