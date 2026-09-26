type CommentKey = {
	key: string;
	shiftKey: boolean;
	metaKey: boolean;
	ctrlKey: boolean;
	isComposing: boolean;
};

export const commentKeySubmits = (event: CommentKey, submitOnEnter: boolean) =>
	!event.isComposing && event.key === "Enter" && (submitOnEnter ? !event.shiftKey : event.metaKey || event.ctrlKey);
