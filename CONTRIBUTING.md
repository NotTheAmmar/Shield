# Contributing to SHIELD

First off, welcome to the team! :tada: 
This guide sets the ground rules for how our team will collaborate on the SHIELD monorepo using the *GitHub Flow* (Open Source style).

## Our Architecture: The Monorepo
We are using a **Monorepo** approach. This means all 5 modules (Frontend, Gateway, Auth, Evidence, and Ledger) live in this single GitHub repository.
If your feature requires changes in the `shield-frontend` and `shield-auth`, you should make those changes on the **same branch** and open a **single Pull Request**.

## The Golden Rules
1. **Never commit directly to the `main` branch.** `main` should always be deployable.
2. **Every Pull Request needs at least 1 review** from a teammate before it can be merged.
3. **Write descriptive commit messages.** Tell us *what* changed and *why*.

## Our Workflow Step-by-Step

### 1. Find or Create an Issue
Before writing code, make sure there is an Issue tracking the work. Assign yourself to it so we don't duplicate effort.

### 2. Create a Feature Branch
Always branch off of `main` and make sure your local `main` is up to date first. Use the following naming convention for branches:
- `feature/<issue-number>-<short-description>` (e.g., `feature/12-login-page`)
- `bugfix/<issue-number>-<short-description>` (e.g., `bugfix/45-fix-db-connection`)

```bash
git checkout main
git pull origin main
git checkout -b feature/12-login-page
```

### 3. Make small, focused commits
As you work, commit your changes in logical chunks. 
- Try to start your commit message with an imperative verb (`Add`, `Fix`, `Update`, `Remove`).
- **Good:** `Add UI layout for user login screen`
- **Bad:** `updated stuff`

### 4. Open a Pull Request!
When your code is ready (or you want early feedback), push your branch and open a Pull Request against `main`.
- Fill out the Pull Request template completely.
- In the description, type `Closes #12` to automatically link and close the related Issue.

### 5. Review & Merge
- Ask a teammate to review your code.
- Address their feedback by pushing new commits to the same branch (the PR will update automatically).
- Once approved, use the **Squash and Merge** button to combine your commits cleanly into `main`, then delete your feature branch!

## Need Help?
If you're ever stuck with a nasty merge conflict or a weird Git error, don't force push (`--force`). Ask the team for help first! Let's build something awesome.
