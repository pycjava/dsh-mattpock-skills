# dsh-mattpock-skills

[Matt Pocock's agent skills](https://github.com/mattpocock/skills) ("Skills
for Real Engineers", MIT) as a standalone
[DeepSeek Harness](https://github.com/deepseek-ai) plugin: one Cordis service
registers a `mattpock-skills` provider on `ctx.skills`, so every session can
use the skills through the `skill` tool with no user-side file copying.

## What ships

Exactly the **promoted set** upstream's own plugin ships, per the repo's
convention: the `engineering/` and `productivity/` buckets — 25 skills
(`tdd`, `code-review`, `grilling`, `grill-me`, `triage`, `to-spec`,
`diagnosing-bugs`, …). The `misc/`, `in-progress/`, and `deprecated/`
buckets are deliberately excluded.

Skill bodies keep upstream's frontmatter semantics:
`disable-model-invocation: true` maps to a user-invocable-only skill in
DSH (14 of them); everything else is model- and user-invocable (11). Sidecar
files each skill references (`tests.md`, `REFERENCE.md`, `scripts/`, ...)
ship next to its `SKILL.md` and resolve through the skill's resourceBase.
The OpenAI-harness `agents/openai.yaml` metadata is not packaged.

## Install

From npm (once published):

```sh
dsh plugin add dsh-mattpock-skills
```

From a local tarball:

```sh
npm pack                      # produces dsh-mattpock-skills-<version>.tgz
dsh plugin add file:./dsh-mattpock-skills-0.1.0.tgz
```

Note: the plugin-manager install path shells out to `pnpm`. Environments
without `pnpm` on PATH (notably the packaged desktop app's bundled backend)
cannot install via that route; there, desktop builds should pre-bundle the
package instead (see the dsh-desktop `desktop-plugins.json` flow).

## Layout

- `index.js` — Cordis service registering the `mattpock-skills` provider
  (same pattern as the bundled `dsh-badge` provider; rank 600, so project
  and user skills can override a bundled name).
- `skills/<name>/SKILL.md` — vendored skill content.
- `skills-manifest.json` — frontmatter parsed at sync time; the runtime
  only reads files, never parses YAML.
- `scripts/sync-skills.mjs` — re-vendor from upstream (see below).
- `scripts/verify-manifest.mjs` — consistency check before packing.

## Re-sync from upstream

```sh
# download the main-branch zip from github.com/mattpocock/skills and unzip
# it to vendor/skills-main (or point DSH_MATTPOCK_SKILLS_SRC at a checkout)
npm run sync
npm run check
```

Then bump `version`, `npm pack`, publish or install the new tarball.

## License

MIT. Skill content is (c) Matt Pocock (see `LICENSE`, `UPSTREAM`); plugin
glue is MIT too.
