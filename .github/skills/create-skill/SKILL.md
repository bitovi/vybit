---
name: create-skill
description: Create new Agent Skills for this project. Use when asked to create a skill, document a workflow, or teach Copilot a new capability. Skills are stored in .github/skills/ and can include instructions, scripts, examples, and resources.
---

# Skill: Creating Agent Skills

This skill teaches how to create Agent Skills for this project following the VS Code Agent Skills standard.

## What Are Agent Skills?

Agent Skills are folders of instructions, scripts, and resources that AI agents (Copilot, Claude, etc.) can load when relevant to perform specialized tasks. They are:
- **Portable**: Work across VS Code, Copilot CLI, and GitHub Copilot coding agent
- **On-demand**: Only loaded when relevant to the current task
- **Composable**: Multiple skills can work together
- **Resource-rich**: Can include scripts, examples, templates, and documentation

## When to Create a Skill

Create a skill when you need to:
- Document a repeatable workflow or process
- Teach domain-specific knowledge that applies to multiple tasks
- Provide scripts, templates, or examples for common operations
- Define specialized capabilities that go beyond coding standards

**Don't create a skill** when you just need:
- Coding standards or style guidelines → Use custom instructions instead
- One-time documentation → Use regular markdown files
- File-specific rules → Use glob-based instructions

## Skill Directory Structure

```
.github/skills/
└── your-skill-name/
    ├── SKILL.md           # Required: Skill definition
    ├── script.sh          # Optional: Helper scripts
    ├── template.ts        # Optional: Code templates
    └── examples/          # Optional: Example files
        └── example-1.md
```

## SKILL.md Format

Every skill must have a `SKILL.md` file with YAML frontmatter:

```markdown
---
name: skill-name
description: Clear description of what the skill does and when to use it
---

# Skill Title

Detailed instructions, guidelines, and examples...
```

### Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique identifier, lowercase with hyphens (max 64 chars) |
| `description` | Yes | What it does and when to use it (max 1024 chars) |

### Writing Effective Descriptions

The description determines when Copilot loads your skill. Be specific about:
- **What** the skill accomplishes
- **When** it should be used (triggers)
- **What kind of tasks** it helps with

## Adding a New Skill

1. Create directory: `.github/skills/your-skill-name/`
2. Create `SKILL.md` with frontmatter and instructions
3. Add any supporting files (scripts, templates, examples)
4. Test by asking Copilot a question the skill should handle
5. Verify the skill was loaded (check if instructions were followed)

## Best Practices

### Do
- Write clear, specific descriptions that trigger on relevant prompts
- Include concrete examples with code
- Reference external files for large templates or scripts
- Document common mistakes and how to avoid them
- Keep instructions actionable and step-by-step

### Don't
- Make descriptions too vague or too broad
- Duplicate content already in custom instructions
- Include huge code blocks (use external files instead)
- Forget to document when NOT to use the skill
- Create skills for one-off tasks
