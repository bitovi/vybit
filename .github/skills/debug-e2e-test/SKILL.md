---
name: debug-e2e-test
description: Debug and fix failing Playwright E2E tests. Use when tests fail, when asked to fix failing tests, or when investigating test failures. Analyzes test output, screenshots, error context, and uses Playwright MCP to identify root causes.
---

# Skill: Debug E2E Test

This skill provides a systematic workflow for debugging and fixing failing Playwright E2E tests in the test-app.

## When to Use This Skill

Use this skill when:
- A Playwright E2E test is failing
- Asked to fix a failing test
- Investigating why tests are broken
- Tests pass locally but fail in CI
- Need to understand what a test failure means

## Prerequisites

- Dev server must be running (`cd test-app && npm run dev`)
- Playwright MCP tools available
- Failed test has generated artifacts in `test-results/`

## Debugging Workflow

### Step 1: Run the Specific Failed Test

Run ONLY the specific failing test using the `-g` flag to get focused output:

```bash
npx playwright test <test-file>.spec.ts -g "test name"
```

### Step 2: Analyze the Test Output

Read the terminal output carefully and extract:
1. **Test location**: File path and line number
2. **Failure type**: What assertion failed
3. **Expected vs Actual**: What the test expected vs what it got
4. **Error message**: The specific error
5. **Artifact paths**: Screenshot and error-context locations

### Step 3: Load the Screenshot

Use the `read_media_file` tool to load the screenshot from the test results:
```
test-results/<test-name>/test-failed-1.png
```

### Step 4: Read the Error Context

Read the `error-context.md` file from the test results directory.

Key things to look for:
- Are the elements the test is looking for present?
- Are there unexpected elements?
- Are there console errors indicating broken functionality?
- Is the page structure what the test expects?

### Step 5: Read the Test Code

Read the failing test code to understand:
- What is it trying to test?
- What user actions does it simulate?
- What assertions does it make?
- Are the selectors specific enough?

### Step 6: Compare Test Expectations with Implementation

Use `grep` or `semantic_search` to find the actual component/page being tested:
```bash
grep -r "text the test looks for" test-app/src/
```

Check:
- Does the text match exactly? (case, spacing, punctuation)
- Are the element types correct?
- Does the page structure match expectations?

### Step 7: Use Playwright MCP (If Needed)

If the issue isn't clear from the screenshot and error context, use Playwright MCP to interact with the live app:

1. Navigate to the page: `playwright_navigate`
2. Take a screenshot: `playwright_screenshot`
3. Get HTML: `playwright_get_visible_html`
4. Click elements: `playwright_click`
5. Inspect what happens: `playwright_get_visible_text`

### Step 8: Fix the Issue

Based on your findings, fix either the test, the code, or both.

### Step 9: Verify the Fix

```bash
npx playwright test <test-file>.spec.ts -g "test name"
```

## Tips for Effective Debugging

1. **Always run the single test first** - Don't debug from full suite output
2. **Start with artifacts** - Screenshot + error-context tell you 90% of issues
3. **Use MCP sparingly** - Only when artifacts don't show the problem
4. **Check obvious things first** - Routes, text, element types
5. **One test at a time** - Fix and verify before moving to next failure
6. **Read the DOM snapshot** - Often more useful than screenshot for structural issues

## Related Skills

- **write-e2e-test**: Create new E2E tests
- **debugging**: Verify error-free UI before testing
