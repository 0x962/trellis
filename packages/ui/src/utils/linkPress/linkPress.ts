export type LinkPress = {
	metaKey: boolean;
	ctrlKey: boolean;
	shiftKey: boolean;
	altKey: boolean;
	button: number;
};

export const linkPress = ({ metaKey, ctrlKey, shiftKey, altKey, button }: LinkPress): LinkPress => ({
	metaKey,
	ctrlKey,
	shiftKey,
	altKey,
	button,
});
