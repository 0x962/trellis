import { cx } from "../../utils/cx";

export type AttentionDotProps = {
	// The words a screen reader says in place of the dot, such as
	// "The agent asks a question".
	label: string;
	// `warning` means a person must act before the run goes on. `danger`
	// means the run failed, or the server holds no live record of it.
	tone?: "warning" | "danger";
};

// A 6 px filled dot that marks one line a person must look at. It takes its
// own place in a row of text and sits before the words it marks.
//
// `ActivityDot` is the other 6 px dot. It says that an agent works, it can
// sit on the corner of an icon, and its colors are `accent` and `metal`.
// This dot uses two other colors: `--warning` when a person must act, and
// `--danger` when a run failed or is lost.
export function AttentionDot({ label, tone = "warning" }: AttentionDotProps) {
	return (
		<span
			role="img"
			aria-label={label}
			className={cx(
				"relative inline-block size-1.5 shrink-0 rounded-round",
				tone === "danger" ? "bg-danger" : "bg-warning",
			)}
		/>
	);
}
