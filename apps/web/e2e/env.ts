// The server URL the Playwright config picked. The runner stores the port
// in the environment before any worker starts, so a spec reads it here.
export const apiUrl = `http://127.0.0.1:${process.env.TRELLIS_E2E_API_PORT}`;
