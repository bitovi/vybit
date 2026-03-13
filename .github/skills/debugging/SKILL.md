---
name: debugging-skill
description: Always start a fresh browser session after any file change, walk through the full user flow, and monitor for errors before proceeding with further work.
---

# Debugging Skill: Error-Free UI Verification

## Purpose
Ensure that after any code change, the app is fully reloaded, the user flow is tested from the beginning, and no runtime errors or warnings are present before continuing with feature work or test automation.

## Workflow

1. **Restart Browser Session**
   - After any file change or hot-reload, always start a new browser session (do not reuse previous state).
   - This ensures no stale state or session issues.

2. **Walk Through Full User Flow**
   - Navigate to the target page.
   - Interact with the UI as a real user would.

3. **Monitor for Errors and Warnings**
   - Capture all browser console logs, errors, and exceptions during navigation and interaction.
   - Do not proceed if any runtime errors or warnings are present.
   - Only continue with feature work or test automation when the UI is confirmed error-free.

## Best Practices
- Always verify the UI is in a clean state before testing features.
- Use Playwright or similar tools to automate the flow and error monitoring.
- Document any errors found and fix them before proceeding.

---

This skill should be followed for all feature implementation, E2E test writing, and UI debugging.
