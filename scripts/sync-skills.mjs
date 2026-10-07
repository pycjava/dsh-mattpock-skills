#!/usr/bin/env node
/**
 * Sync Matt Pocock's promoted skills into this package.
 *
 * Source: a checkout (or unzipped archive) of github.com/mattpocock/skills.
 * Resolution order: the DSH_MATTPOCK_SKILLS_SRC environment variable, then
 * ./vendor/skills-main inside this repo (download the main-branch zip from
 * https://github.com/mattpocock/skills and unzip it there), then the
 * historical sibling layout ../mattpocock-skills-src/skills-main.
 *
 * The upstream repo's convention (see its AGENTS.md/CLAUDE.md): skills in
 * `engineering/` and `productivity/` are the promoted set that ships in its
 * own plugin; `misc/`, `in-progress/`, and `deprecated/` are not. This
 * script copies exactly the promoted buckets, flattening the bucket layout
 * into `skills/<skill-name>/` because DSH discovers skills as one directory
 * per skill.
 *
 * For each skill it copies SKILL.md plus every sidecar file (tests.md,
 * REFERENCE.md, scripts/, ...) except `agents/`, which holds OpenAI-harness
 * UI metadata no SKILL.md references. It parses each SKILL.md's YAML
 * frontmatter here, at sync time, with the same semantics as
 * @deepseek-ai/dsh-skill-filesystem (name + description required;
 * `disable-model-invocation` and `user-invocable` booleans), and writes
 * skills-manifest.json so the runtime never parses YAML.
 */
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseFrontmatter } from '../lib/frontmatter.mjs'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const candidateSources = [
  resolve(packageRoot, 'vendor', 'skills-main'),
  resolve(packageRoot, '..', 'mattpocock-skills-src', 'skills-main'),
]
const defaultSource = candidateSources.find((p) => existsSync(join(p, 'skills')))
  ?? candidateSources[0]
const sourceRoot = process.env.DSH_MATTPOCK_SKILLS_SRC
  ? resolve(process.env.DSH_MATTPOCK_SKILLS_SRC)
  : defaultSource
const PROMOTED_BUCKETS = ['engineering', 'productivity']
const SKILL_NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

/** Boolean frontmatter semantics mirrored from dsh-skill-filesystem. */
function parseInvocation (data, name) {
  const boolean = (key) => {
    if (!Object.hasOwn(data, key)) return undefined
    const value = data[key]
    if (['true', 'yes', 'on', '1'].includes(value.toLowerCase())) return true
    if (['false', 'no', 'off', '0'].includes(value.toLowerCase())) return false
    throw new Error(`skill ${name}: frontmatter field "${key}" must be a boolean, got ${JSON.stringify(value)}`)
  }
  const disableModelInvocation = boolean('disable-model-invocation')
  const userInvocable = boolean('user-invocable')
  return {
    modelInvocable: disableModelInvocation !== true,
    userInvocable: userInvocable !== false,
  }
}

async function main () {
  if (!existsSync(join(sourceRoot, 'skills'))) {
    throw new Error(`source ${sourceRoot} has no skills/ directory; set DSH_MATTPOCK_SKILLS_SRC to a mattpocock/skills checkout`)
  }
  const targetRoot = join(packageRoot, 'skills')
  await rm(targetRoot, { recursive: true, force: true })
  await mkdir(targetRoot, { recursive: true })

  const entries = []
  const seen = new Set()
  for (const bucket of PROMOTED_BUCKETS) {
    const bucketDir = join(sourceRoot, 'skills', bucket)
    if (!existsSync(bucketDir)) throw new Error(`source ${sourceRoot} has no promoted bucket skills/${bucket}`)
    for (const dir of await readdir(bucketDir, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue
      const skillDir = join(bucketDir, dir.name)
      const skillPath = join(skillDir, 'SKILL.md')
      if (!existsSync(skillPath)) throw new Error(`skill ${bucket}/${dir.name} has no SKILL.md`)
      if (!SKILL_NAME.test(dir.name)) throw new Error(`skill directory "${dir.name}" is not kebab-case`)
      if (seen.has(dir.name)) throw new Error(`duplicate skill name across buckets: ${dir.name}`)
      seen.add(dir.name)

      const { data, body } = parseFrontmatter(await readFile(skillPath, 'utf8'))
      if (data.name !== dir.name) {
        throw new Error(`skill ${bucket}/${dir.name}: frontmatter name ${JSON.stringify(data.name)} !== directory name`)
      }
      if (!data.description) throw new Error(`skill ${dir.name}: frontmatter requires a description`)
      if (!body.trim()) throw new Error(`skill ${dir.name}: empty body`)

      // Copy the whole skill directory minus agents/ (OpenAI-harness UI
      // metadata; no SKILL.md references it).
      const agentsDir = join(skillDir, 'agents')
      await cp(skillDir, join(targetRoot, dir.name), {
        recursive: true,
        filter: (p) => p !== agentsDir && !p.startsWith(agentsDir + (process.platform === 'win32' ? '\\' : '/')),
      })
      entries.push({
        name: data.name,
        description: data.description,
        invocation: parseInvocation(data, dir.name),
        bucket,
      })
      console.log(`synced ${bucket}/${dir.name}`)
    }
  }

  entries.sort((a, b) => a.name.localeCompare(b.name))
  const manifest = {
    version: 1,
    source: 'https://github.com/mattpocock/skills',
    buckets: PROMOTED_BUCKETS,
    syncedAt: new Date().toISOString(),
    skills: entries,
  }
  await writeFile(join(packageRoot, 'skills-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  await writeFile(
    join(packageRoot, 'UPSTREAM'),
    [
      'Skill content vendored from:',
      '  https://github.com/mattpocock/skills (main branch)',
      `Synced at: ${manifest.syncedAt}`,
      `Buckets: ${PROMOTED_BUCKETS.join(', ')} (the promoted set its own plugin ships)`,
      'License: MIT (c) Matt Pocock, see LICENSE',
      'Upstream convention: misc/, in-progress/, deprecated/ buckets are NOT shipped.',
      'Re-sync: pnpm --dir plugins/dsh-mattpock-skills sync (or node scripts/sync-skills.mjs)',
      '',
    ].join('\n'),
  )
  console.log(`wrote skills-manifest.json (${entries.length} skills)`)
}

await main()
