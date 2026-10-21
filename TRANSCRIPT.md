# Transcript

The whole project was built in one Claude Code session in the Claude desktop app, from the first brainstorming prompt to the final push. The logs below are the app's own files, copied as they are, with nothing edited or removed.

| Path | What it is |
| --- | --- |
| [`TRANSCRIPT.jsonl`](TRANSCRIPT.jsonl) | The main session: every prompt, every reply, every tool call and its result. |
| [`transcript/subagents/`](transcript/subagents/) | One log per subagent (implementers and reviewers), with each one's metadata. |
| [`.superpowers/sdd/2026-10-21-trial-booking/`](.superpowers/sdd/2026-10-21-trial-booking/) | The build's working files: the ledger (`progress.md`) with every ruling, and each task's brief, report, review and diff. |

The log is JSON Lines: one JSON object per line, in order. The context was compacted three times. Each time a summary was added, and the messages before it stayed in the file. The turn that committed these files is not in the copy, because the copy was taken just before it.

The prompts:

```bash
jq -r 'select(.type=="user" and (.message.content|type)=="string") | .message.content' TRANSCRIPT.jsonl
```

The replies, without tool calls:

```bash
jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="text") | .text' TRANSCRIPT.jsonl
```
