export type ComposerCloseAction = "block" | "confirm" | "close";

export const composerCloseAction = ({
	createPending,
	dirty,
}: {
	createPending: boolean;
	dirty: boolean;
}): ComposerCloseAction => {
	if (createPending) return "block";
	return dirty ? "confirm" : "close";
};
