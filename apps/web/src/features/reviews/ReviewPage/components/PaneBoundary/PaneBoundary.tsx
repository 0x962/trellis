import { Button, FailureState } from "@trellis/ui";
import { Component, type ErrorInfo, type ReactNode } from "react";

export type PaneBoundaryProps = {
	// The value of the tab, such as "diff". The console line names it.
	tab: string;
	children: ReactNode;
};

type PaneBoundaryState = { error: Error | null };

// Catches an error that one tab of the review page throws while it draws.
// That tab then shows the error and a Retry button, and the header, the
// other tabs and the verdict bar keep working. Without it, React unmounts
// up to the route error page and the whole review goes blank.
export class PaneBoundary extends Component<PaneBoundaryProps, PaneBoundaryState> {
	state: PaneBoundaryState = { error: null };

	static getDerivedStateFromError(error: Error): PaneBoundaryState {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error(`The ${this.props.tab} tab of the review failed to draw.`, error, info.componentStack);
	}

	render() {
		if (this.state.error === null) return this.props.children;
		return (
			<FailureState
				title="This tab did not draw"
				description="The rest of the review still works."
				detail={this.state.error.message}
				action={
					<Button size="md" onClick={() => this.setState({ error: null })}>
						Retry
					</Button>
				}
			/>
		);
	}
}
