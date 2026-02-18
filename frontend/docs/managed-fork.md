# Managed Fork Playbook

This guide describes how to run a private repo while continuously tracking upstream changes.

## Goals

- Keep OSS and managed repos close enough to sync often.
- Keep managed-only pipeline and secrets out of OSS.
- Keep merges predictable with minimal conflict surface.
## Recommended Repository Model

1. Keep usefolio/folio as `upstream`.
2. Keep your private managed repo as `origin`.
3. Keep managed-only assets isolated (pipeline files, deployment overrides, private docs) so upstream merges stay clean.

## One-Time Setup

In your private managed clone:

```bash
# Configure upstream remote
npm run fork:setup-upstream -- git@github.com:<org>/<oss-repo>.git

# Verify remotes
git remote -v
```

## Ongoing Sync

In your private managed clone:

```bash
# Merge upstream/main into current branch (default target is main)
npm run fork:sync
```

Optional strict mode (fast-forward only):

```bash
MERGE_MODE=ff-only npm run fork:sync
```

You can also override branches/remotes:

```bash
UPSTREAM_REMOTE=upstream UPSTREAM_BRANCH=main TARGET_BRANCH=main npm run fork:sync
```

## Secrets Strategy

Use this repo’s `.env.example` as the public template.

