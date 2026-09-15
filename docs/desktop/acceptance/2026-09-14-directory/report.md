# Data directory and macOS title bar

The desktop opens an existing Trellis data directory in place through File > Choose data directory.
The first-launch screen also has this choice.
The app and helper share the saved selection in the desktop profile.
Runtime releases stay under that profile when the selected database lives elsewhere.

The handoff confirms the paths and backup before it disables a matching standalone service.
It verifies both the process ID and the service's configured data directory.
The offline helper backs up the database before migrations and pauses automation.
External agent records and files remain intact. An incomplete handoff blocks startup.

The window uses macOS native controls at x16, y14 and a 40 px title strip.
The sidebar starts below the strip in both expanded and collapsed states.
Browser layouts retain their existing top edge.

## Checks

| Check | Result |
| --- | --- |
| Desktop unit suite | 30 passed, 88 assertions |
| Desktop integration suite | 45 passed, 128 assertions; two signed-app tests skipped in this command |
| Signed Electron app | Both tests passed, 57 assertions |
| Offline handoff server tests | Five passed, 20 assertions |
| Signed resource smoke | Eight checks passed, including native PTY and host restart |
| Workspace typechecks | All nine passed |
| Repository checks | 15 passed, 106 assertions |
| Biome | 2,256 files passed |
| Title bar component and window tests | Five passed |
| Title bar browser tests | Two passed; Aside checks covered dark, light, expanded, and collapsed states |

The existing-directory app test seeds a project, stops its host, selects its directory, and restarts the signed app.
It verifies the same project ID through the new host, the backup path, the persisted selection, and the fixed release cache.
Both app tests use unique service identifiers and scratch data directories.
The native window test verifies full content bounds and traffic-light positions.
Native drag behavior and a native window screenshot remain unverified.

## Local app replacement

The reopened app uses resource release `b6500ad0cfee26c6f1af07451ccd844e93aebc82f721dab59b69edd8de772695`, protocol 5.
Its authenticated host runs on port 58679. The existing desktop project `test` remains present.
The separate standalone service on port 4521 retains its original PID and data.
No selection of the user's `~/.trellis` directory occurred during these tests.

The first replacement launch returned exit 78 from launchd.
The macOS log reported that it could not locate `Contents/MacOS/TrellisHost` through the registered parent bundle.
An explicit LaunchServices refresh followed by service registration fixed that launch:

```sh
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f <path-to-Trellis.app>
<path-to-Trellis.app>/Contents/MacOS/TrellisHost register
```

The final native app view loaded Needs you and retained the test project.
The preview has an ad-hoc signature. Developer ID distribution and notarization remain separate release gates.
