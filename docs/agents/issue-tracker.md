# Issue tracker: GitHub

Issues and specs live in GitHub Issues for
CyberNovaPixelPulse/are-you-blind-game. Use the gh CLI.

## Conventions

Run commands from this clone, or pass
--repo CyberNovaPixelPulse/are-you-blind-game.

- Create: gh issue create --title "..." --body-file <file>
- Read: gh issue view <number> --json number,title,body,labels,comments
- List: gh issue list --state open --json number,title,body,labels
- Comment: gh issue comment <number> --body-file <file>
- Apply labels: gh issue edit <number> --add-label "..."
- Remove labels: gh issue edit <number> --remove-label "..."
- Close: gh issue close <number>

For multiline bodies and comments, write the exact text to a temporary
file and pass --body-file.

## Parent issues and dependencies

Use native GitHub sub-issues and issue dependencies when available.
For sub-issues, use commands supported by the installed gh version,
or GitHub's API.

If sub-issues are unavailable, add "Part of #<parent>" to the child body
and link the child from a task list in the parent.

If native dependencies are unavailable, add
"Blocked by: #<number>, #<number>" to the child body.
A ticket is unblocked when all its blockers are closed.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Skill operations

When a skill says "publish to the issue tracker", create a GitHub issue.
When a skill says "fetch the relevant ticket", read the GitHub issue.

## Wayfinding operations

- Map: one issue labelled wayfinder:map containing Notes,
  Decisions-so-far, and Fog.
- Child tickets: link each ticket to its map and use
  wayfinder:research, wayfinder:prototype, wayfinder:grilling,
  or wayfinder:task.
- Frontier: select the first open child in map order with no open
  blockers and no assignee.
- Claim: assign the ticket to the driving developer.
- Resolve: comment with the result, close the ticket, and append
  a concise result and link to the map's Decisions-so-far.
