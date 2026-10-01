import { createStoryApp } from "../createStoryApp";
import { createStoryRouter } from "../createStoryRouter";
import { StoryContent } from "../StoryContent";
import type { StoryParameters } from "../types";

export async function loadStoryApp(parameters: StoryParameters = {}) {
	const app = createStoryApp(parameters);
	const router = createStoryRouter(app, parameters, () => <StoryContent />);
	await router.load();
	return { app, router };
}
