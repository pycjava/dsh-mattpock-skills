#!/usr/bin/env node
/**
 * Verify the packed skill set is self-consistent:
 *   - skills-manifest.json parses and lists kebab-case unique names
 *   - every listed skill directory exists with a SKILL.md whose frontmatter
 *     matches the manifest entry (name/description/invocation)
 *   - no skills/ directory is missing from the manifest (or vice versa)
 *   - every relative Markdown link inside a SKILL.md resolves inside the
 *     packaged tree, so `skill` tool resourceBase lookups cannot dangle
 *
 * Run via `pnpm check` before `npm pack`.
 */
import { readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseFrontmatter } from '../lib/frontmatter.mjs'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SKILL_NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
let failures = 0

const fail = (message) => {
  failures += 1
  console.error(`verify-manifest: FAIL ${message}`)
}

const manifestPath = join(packageRoot, 'skills-manifest.json')
if (!existsSync(manifestPath)) throw new Error('skills-manifest.json is missing; run scripts/sync-skills.mjs first')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))

const names = manifest.skills.map((skill) => skill.name)
if (new Set(names).size !== names.length) fail('duplicate skill names in manifest')
for (const skill of manifest.skills) {
  if (!SKILL_NAME.test(skill.name)) fail(`skill ${skill.name}: name is not kebab-case`)
  if (typeof skill.description !== 'string' || skill.description.length === 0) fail(`skill ${skill.name}: empty description`)
  const invocation = skill.invocation ?? {}
  if (typeof invocation.modelInvocable !== 'boolean' || typeof invocation.userInvocable !== 'boolean') {
    fail(`skill ${skill.name}: invocation flags must be booleans`)
  }
}

const packed = (await readdir(join(packageRoot, 'skills'), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()
const listed = [...names].sort()
for (const name of packed.filter((n) => !listed.includes(n))) fail(`skills/${name} exists on disk but is not in the manifest`)
for (const name of listed.filter((n) => !packed.includes(n))) fail(`manifest lists ${name} but skills/${name} does not exist`)

for (const skill of manifest.skills) {
  const skillMd = join(packageRoot, 'skills', skill.name, 'SKILL.md')
  if (!existsSync(skillMd)) {
    fail(`skill ${skill.name}: missing ${skillMd}`)
    continue
  }
  const raw = await readFile(skillMd, 'utf8')
  let parsed
  try {
    parsed = parseFrontmatter(raw)
  } catch (error) {
    fail(`skill ${skill.name}: SKILL.md frontmatter no longer parses: ${error.message}`)
    continue
  }
  if (parsed.data.name !== skill.name) fail(`skill ${skill.name}: manifest name != SKILL.md name`)
  if (parsed.data.description !== skill.description) fail(`skill ${skill.name}: manifest description != SKILL.md description`)
  const disableModel = (parsed.data['disable-model-invocation'] ?? '').toLowerCase()
  if ((disableModel === 'true') === skill.invocation.modelInvocable) fail(`skill ${skill.name}: modelInvocable disagrees with disable-model-invocation`)
  const userOnly = (parsed.data['user-invocable'] ?? '').toLowerCase()
  if ((userOnly === 'false') === skill.invocation.userInvocable) fail(`skill ${skill.name}: userInvocable disagrees with user-invocable`)

  // Relative file references inside the body must resolve within the
  // packaged tree. Only targets with an extension are checked: extensionless
  // targets are placeholders in prose examples (e.g. `[title](link)`) or
  // intra-document anchors, never packaged files.
  for (const match of parsed.body.matchAll(/\[[^\]]*\]\(([^)#\s]+)[^)]*\)/g)) {
    const target = match[1]
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('/')) continue
    if (extname(target) === '') continue
    if (!existsSync(join(packageRoot, 'skills', skill.name, target))) {
      fail(`skill ${skill.name}: relative link target "${target}" not packaged`)
    }
  }
}

if (failures > 0) {
  console.error(`verify-manifest: ${failures} failure(s)`)
  process.exit(1)
}
console.log(`verify-manifest: OK (${manifest.skills.length} skills)`)
