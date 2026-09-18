---
"@trellis/server": patch
"@trellis/desktop": patch
---

Remove the files of finished agent work. The server sweeps the data home at boot and then once an hour: the clean worktree of a run that is closed on a done or canceled ticket, the terminal output of earlier terminals, and the attempt directory that no run holds. The desktop service removes each package release that is neither active nor installed and that no live process runs from, and each production build removes the build directories of earlier failed builds.
