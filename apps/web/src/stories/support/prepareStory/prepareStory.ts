import { StoryContent } from "../components/StoryContent";
import { createStoryApp } from "../createStoryApp";
import { createStoryRouter } from "../createStoryRouter";
import type { StoryParameters } from "../types";

export const prepareStory = async (parameters: StoryParameters = {}) => {
	const app = createStoryApp(parameters);
	const router = createStoryRouter(app, parameters, StoryContent);
	await router.load();
	return { app, router };
};

export type PreparedStory = Awaited<ReturnType<typeof prepareStory>>;
