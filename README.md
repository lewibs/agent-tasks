# Agent Tasks 🤖✅

Tag any task in your Obsidian vault with `#agent` and let an AI agent complete it.

```markdown
- [ ] Summarize this week's daily notes into a weekly review #agent
- [ ] Find all notes mentioning "parakeet" and link them to the transcription MOC #agent
- [ ] Research NVIDIA Sortformer and write a note about how it works #agent
```

Press the **brain-circuit ribbon button** (or run the "Run agent tasks" command) and each open `#agent` task is handed to [Claude Code](https://claude.com/claude-code) running headless against your vault. The agent can read, create, and edit notes, run commands, search the web — everything Claude Code can do. When it finishes:

- the checkbox is checked off (`- [x]`)
- a `🤖` summary of what the agent did is appended to the task line
- long results become a note in `agent-summaries/`, linked from the task line: `- [x] task #agent [[agent-summaries/task-name]]`

While a task runs it is marked `- [/]`, and progress streams to the status bar. Tasks run sequentially; failures are recorded under the task with `⚠️` and the checkbox is restored.

## Requirements

- **Desktop only** (the plugin spawns a local process)
- [Claude Code](https://claude.com/claude-code) installed and logged in (`claude` on your PATH, or set the path in settings) — the plugin uses your existing Claude login, no API key needed

## Beyond the vault: email, calendars, APIs

The agent inherits your Claude Code configuration, including **MCP servers**. Add an email MCP server to Claude Code and `- [ ] email Sam the meeting notes from today #agent` works with no plugin changes. Anything you teach Claude Code, your tasks can use.

## Settings

- **Claude Code path** — where the `claude` executable lives (default: `claude` on PATH)
- **Model** — default, Sonnet, Opus, or Haiku
- **Permissions** — "Accept edits" (agent can edit files, risky commands blocked) or "Full autonomy" (no permission prompts; more capable, use with care)
- **Task tag** — the tag that marks agent tasks (default `#agent`)
- **Results folder** — where long results are written

## Safety notes

- The agent operates on your real vault. "Accept edits" mode is the default; "Full autonomy" skips Claude Code's permission prompts entirely.
- If Obsidian closes mid-run, tasks can be left marked `- [/]` — use the "Reset stuck in-progress agent tasks" command.
