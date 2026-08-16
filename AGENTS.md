## Planning

Write plans for complex implementation work under `plans/`.

Human-facing game documents use HTML. Internal plans may use Markdown.

## Game documentation

- Label unknown rules as open questions; do not turn assumptions into rules.
- Record committed choices in `docs/design/decisions.html`.
- Update `docs/versions/changelog.html` when rules, components, or balance change.
- Archive replaced rules and component specs instead of erasing their history.
  - This is for reference when designing and reasoning on previous choices, not on maintaining backwards compatibility
  - Do not maintain backwards compatibility with components or app code
- Keep navigation links relative so the docs work from the filesystem.

## Code

- Do not add comments that describe what the code does.
- Add brief comments only when they explain a non-obvious reason.
