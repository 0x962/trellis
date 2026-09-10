// The margin address for one pull request. margin routes on the whole pull
// request URL after its own origin, so the URL follows one slash verbatim.
export const marginUrl = (url: string): string => `http://margin.localhost/${url}`;
