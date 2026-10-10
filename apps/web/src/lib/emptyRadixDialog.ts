// cmdk carries its own Cmd-K dialog, built on Radix. Every overlay in this
// app is Base UI, and `Command.Dialog` is the Base UI panel of
// packages/ui, so the Radix one never renders. `vite.config.ts` maps the
// Radix dialog package onto this file, which keeps 20 KB of a second
// overlay library out of the bundle.

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
