# Superpowers

This project uses [Superpowers](https://github.com/obra/superpowers) — an agentic skills framework for software development.

## Skill System

Skills are located in the `skills/` directory. Each skill has a `SKILL.md` file with YAML frontmatter containing `name` and `description` fields.

## How to Use Skills

Before taking any action, check if a relevant skill exists. If a skill might apply (even 1% chance), read and follow it.

### Skill Priority

1. **Process skills first** (brainstorming, debugging) — determine HOW to approach the task
2. **Implementation skills second** — guide execution

### Key Principles

- "Let's build X" → brainstorming first, then implementation skills
- "Fix this bug" → systematic-debugging first, then domain-specific skills
- YAGNI (You Aren't Gonna Need It) — remove unnecessary features
- DRY (Don't Repeat Yourself)
- TDD (Test-Driven Development) — write tests first, always

### Available Skills

| Skill | When to Use |
|-------|-------------|
| brainstorming | Before any creative work — creating features, building components, adding functionality |
| writing-plans | When you have a spec or requirements for a multi-step task, before touching code |
| executing-plans | When you have a written implementation plan to execute |
| subagent-driven-development | When executing implementation plans with independent tasks |
| test-driven-development | When implementing any feature or bugfix, before writing implementation code |
| systematic-debugging | When encountering any bug, test failure, or unexpected behavior |
| verification-before-completion | When about to claim work is complete or passing |
| requesting-code-review | When completing tasks or before merging |
| receiving-code-review | When receiving code review feedback |
| using-git-worktrees | When starting feature work that needs isolation |
| finishing-a-development-branch | When implementation is complete and needs integration |
| dispatching-parallel-agents | When facing 2+ independent tasks |
| writing-skills | When creating new skills or editing existing ones |

### Workflow

The typical workflow is:
1. **Brainstorm** → Refine ideas into designs
2. **Write Plan** → Create detailed implementation plan
3. **Execute** → Implement via subagent-driven-development or executing-plans
4. **Review** → Code review between tasks
5. **Finish** → Merge, PR, or keep branch

### Red Flags — STOP

These thoughts mean you're rationalizing:
- "This is just a simple question" — Check for skills anyway
- "I need more context first" — Skill check comes BEFORE clarifying questions
- "Let me explore the codebase first" — Skills tell you HOW to explore
- "This doesn't need a formal skill" — If a skill exists, use it
- "The skill is overkill" — Simple things become complex. Use it.

### User Instructions Override

User's explicit instructions always take precedence over skill instructions.
