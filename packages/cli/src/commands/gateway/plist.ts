type Input = { bun: string; entry: string; routes: string; port: number; log: string };
const xml = (value: string) =>
	value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
export function gatewayPlist(input: Input) {
	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>com.trellis.gateway</string>
<key>ProgramArguments</key><array><string>${xml(input.bun)}</string><string>${xml(input.entry)}</string></array>
<key>EnvironmentVariables</key><dict>
<key>GATEWAY_PORT</key><string>${input.port}</string>
<key>GATEWAY_ROUTES_FILE</key><string>${xml(input.routes)}</string>
</dict>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>10</integer>
<key>StandardOutPath</key><string>${xml(input.log)}</string>
<key>StandardErrorPath</key><string>${xml(input.log)}</string>
</dict></plist>
`;
}
