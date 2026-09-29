import { Component, createRef, type ReactNode } from "react";

type Props = { revision: string; children: ReactNode };
type Snapshot = { element: HTMLElement; top: number; viewport: HTMLElement; scrollTop: number } | null;

export class TimelineScrollAnchor extends Component<Props> {
	private content = createRef<HTMLDivElement>();

	getSnapshotBeforeUpdate(previous: Props): Snapshot {
		if (previous.revision === this.props.revision) return null;
		const viewport = this.content.current?.closest<HTMLElement>(".overflow-auto");
		if (!viewport) return null;
		const top = viewport.getBoundingClientRect().top;
		const element = [
			...this.content.current!.querySelectorAll<HTMLElement>("[data-update-id], [aria-expanded] > [data-row-head]"),
		].find((row) => row.getBoundingClientRect().bottom > top);
		return element
			? { element, top: element.getBoundingClientRect().top, viewport, scrollTop: viewport.scrollTop }
			: null;
	}

	componentDidUpdate(_previous: Props, _state: unknown, snapshot: Snapshot) {
		if (snapshot?.element.isConnected) {
			snapshot.viewport.scrollTop = snapshot.scrollTop + snapshot.element.getBoundingClientRect().top - snapshot.top;
		}
	}

	render() {
		return (
			<div ref={this.content} className="[overflow-anchor:none]">
				{this.props.children}
			</div>
		);
	}
}
