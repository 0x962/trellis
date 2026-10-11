import { StoryContent } from "../components/StoryContent";
import { createStoryApp } from "../createStoryApp";
import { createStoryRouter } from "../createStoryRouter";
import { resetStoryState } from "../resetStoryState";
import type { StoryParameters } from "../types";

export type PreparedStory = {
	app: ReturnType<typeof createStoryApp>;
	router: ReturnType<typeof createStoryRouter>;
};

const preparedStories = new WeakMap<AbortSignal, Promise<PreparedStory>>();

const createPreparedStory = async (signal: AbortSignal, parameters: StoryParameters): Promise<PreparedStory> => {
	resetStoryState(parameters.actor, {
		preserveNavigationPreferences: parameters.preserveNavigationPreferences,
	});
	const app = createStoryApp(parameters);
	const router = createStoryRouter(app, parameters, StoryContent);
	signal.addEventListener(
		"abort",
		() => {
			app.queryClient.clear();
			preparedStories.delete(signal);
		},
		{ once: true },
	);
	await router.load();
	return { app, router };
};

export const prepareStory = (signal: AbortSignal, parameters: StoryParameters = {}): Promise<PreparedStory> => {
	let prepared = preparedStories.get(signal);
	if (!prepared) {
		prepared = createPreparedStory(signal, parameters);
		preparedStories.set(signal, prepared);
	}
	return prepared;
};
