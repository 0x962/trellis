// Command.Dialog uses the Base UI panel in packages/ui. The cmdkDialog
// plugin sends cmdk's unused dialog import to these functions.

const notPartOfTheApp = () => {
	throw new Error("cmdk's Radix dialog is not part of this app. Use Command.Dialog from @trellis/ui.");
};

export const Root = notPartOfTheApp;
export const Trigger = notPartOfTheApp;
export const Portal = notPartOfTheApp;
export const Overlay = notPartOfTheApp;
export const Content = notPartOfTheApp;
export const Title = notPartOfTheApp;
export const Description = notPartOfTheApp;
export const Close = notPartOfTheApp;
