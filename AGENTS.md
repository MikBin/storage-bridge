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

<!-- JULES MCP GUIDELINES START -->

## Jules MCP Orchestrator Mode

This project can use the jules-mcp server in orchestrator mode where a local agent coordinates work with Jules as a remote coding assistant.

### Overview

Jules is an advanced developer agent. Simply specify the task clearly and concisely - no need to provide code snippets or implementation details. Jules will analyze the codebase, plan the work, and execute it independently.

### Orchestrator Workflow

When delegating work to Jules, follow this sequential workflow:

1. **Pull Latest Changes** — `git pull origin <branch>` before creating any session
2. **Create Jules Session** — Use `jules_create_session` with:
   - `owner`, `repo`, `branch` (required — **must be the default branch `main`/`master`**, Jules creates its own feature branch)
   - `prompt` (required — clear task description)
   - `title`, `requirePlanApproval`, `automationMode` (`"AUTO_CREATE_PR"`) (optional)
3. **Monitor Session** — Use `jules_wait` (recommended: 120s intervals) + `jules_check_jules` for compact polling (`Q/C/F/N`). Only use `jules_get_session` after an actionable signal. Handle states:
   - `AWAITING_PLAN_APPROVAL` → `jules_approve_plan`
   - `AWAITING_USER_FEEDBACK` → `jules_send_message`
   - `IN_PROGRESS` → continue monitoring
   - `COMPLETED` / `FAILED` → proceed
4. **Extract PR** — `jules_extract_pr_from_session` to get PR URL and details
5. **Merge PR** — `merge_pull_request` (squash recommended)
6. **Delete Branch** — Clean up the merged branch
7. **Pull Changes Locally** — `git pull origin <branch>`

**Important:** Sessions must be processed sequentially. Complete the full workflow before starting the next session.

### Jules MCP Tools Reference

| Tool | Description |
|------|-------------|
| `jules_create_session` | Create a new Jules coding session for a GitHub repository |
| `jules_get_session` | Fetch session metadata, state, and outputs |
| `jules_check_jules` | Minimal polling check returning `Q`, `C`, `F`, or `N` |
| `jules_list_sessions` | List all Jules sessions |
| `jules_delete_session` | Delete a Jules session |
| `jules_approve_plan` | Approve the plan for a session awaiting approval |
| `jules_send_message` | Send a clarification or instruction to a session |
| `jules_list_activities` | List activities for a Jules session |
| `jules_get_activity` | Get a single activity by ID |
| `jules_monitor_session` | Poll a session until completion with progress notifications |
| `jules_wait` | Pause execution for a given number of seconds (max 600) |
| `jules_list_sources` | List available GitHub repositories |
| `jules_get_source` | Get details for a specific source |
| `jules_extract_pr_from_session` | Extract PR information from completed session outputs |

<!-- JULES MCP GUIDELINES END -->

<!-- BACKLOG.MD MCP GUIDELINES START -->

<CRITICAL_INSTRUCTION>

## BACKLOG WORKFLOW INSTRUCTIONS

This project uses Backlog.md MCP for all task and project management activities.

**CRITICAL GUIDANCE**

- If your client supports MCP resources, read `backlog://workflow/overview` to understand when and how to use Backlog for this project.
- If your client only supports tools or the above request fails, call `backlog.get_backlog_instructions()` to load the tool-oriented overview. Use the `instruction` selector when you need `task-creation`, `task-execution`, or `task-finalization`.

- **First time working here?** Read the overview resource IMMEDIATELY to learn the workflow
- **Already familiar?** You should have the overview cached ("## Backlog.md Overview (MCP)")
- **When to read it**: BEFORE creating tasks, or when you're unsure whether to track work

These guides cover:
- Decision framework for when to create tasks
- Search-first workflow to avoid duplicates
- Links to detailed guides for task creation, execution, and finalization
- MCP tools reference

You MUST read the overview resource to understand the complete workflow. The information is NOT summarized here.

</CRITICAL_INSTRUCTION>

<!-- BACKLOG.MD MCP GUIDELINES END -->
