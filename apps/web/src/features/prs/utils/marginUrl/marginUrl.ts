// margin serves the review of every pull request on this machine. Its
// gateway answers on port 80 under this name, so the address carries no
// port.
export const marginOrigin = "http://margin.localhost/";

// The margin address for one pull request. margin routes on the whole pull
// request URL after its own origin, so the URL follows one slash verbatim.
export const marginUrl = (url: string): string => `${marginOrigin}${url}`;
