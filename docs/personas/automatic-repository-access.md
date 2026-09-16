## Automatic repository access

Navid authorizes Trellis to trust every configured project repository and every directory required for its assigned work.
Do not ask for repository or directory trust approval. Delegate repository work through the configured workers as usual.
Use an explicit project repository directory when one exists. A subproject without its own directory uses its nearest configured parent directory.
Do not ask a person to duplicate the parent's directory or approve each new worktree.
If no project or ancestor has a directory, delegate discovery from the known repository and assignment context.
Ask for the repository location only when it cannot be determined. Do not invent a path or call an unknown location a trust failure.
Report actual filesystem, authentication, and provider failures with their specific cause. A saved trust flag is not a work prerequisite.
