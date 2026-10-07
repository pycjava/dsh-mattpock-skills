/**
 * dsh-mattpock-skills: bundled skill provider.
 *
 * Ships Matt Pocock's promoted engineering + productivity skills
 * (https://github.com/mattpocock/skills, MIT) inside the package and exposes
 * them through the DSH `ctx.skills` registry, so every desktop session can
 * call the `skill` tool on them without any user-side installation.
 *
 * The skill bodies are static trusted content packed by `scripts/
 * sync-skills.mjs`, which also pre-parses each SKILL.md's YAML frontmatter
 * into skills-manifest.json. Runtime code therefore only reads files; it
 * never parses YAML.
 *
 * Registration follows the same shape as the bundled `dsh-badge` provider
 * (@deepseek-ai/dsh-skill-badge): one provider whose candidates carry the
 * standard BUNDLED_SKILL_RANK (600) so project and user skills can override
 * a bundled name, and whose resourceBase points at the skill directory so
 * relative references between SKILL.md and its sidecar files keep working.
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { Service } from '@deepseek-ai/cordis'

/** Cordis plugin name; matches the desktop bundle patch row id. */
export const name = 'dsh-mattpock-skills'

/** Standard precedence rank for packaged skill providers (BUNDLED_SKILL_RANK). */
const BUNDLED_SKILL_RANK = 600

const require = createRequire(import.meta.url)

/**
 * Parsed skill metadata, generated at pack time by scripts/sync-skills.mjs.
 * @type {{ version: string, source: string, syncedAt: string,
 *          skills: Array<{ name: string, description: string,
 *            invocation: { modelInvocable: boolean, userInvocable: boolean },
 *            bucket: string }> }}
 */
const manifest = require('./skills-manifest.json')

/**
 * Strip a leading YAML frontmatter block (`---` fenced) from a skill file
 * and trim the body. Files without frontmatter return as-is.
 * @param {string} raw
 * @returns {string}
 */
function stripFrontmatter (raw) {
  if (!raw.startsWith('---')) return raw.trim()
  const end = raw.indexOf('\n---', 3)
  if (end === -1) return raw.trim()
  const after = raw.indexOf('\n', end + 1)
  return (after === -1 ? '' : raw.slice(after + 1)).trim()
}

/** Directory holding one skill's SKILL.md plus its sidecar files. */
const skillsRoot = new URL('./skills/', import.meta.url)

/**
 * The provider registered on `ctx.skills`. `list` returns pre-parsed
 * candidates; `get` loads the winning skill's body from its SKILL.md.
 */
const provider = {
  name: 'mattpock-skills',
  async list () {
    return manifest.skills.map((skill) => {
      const directory = fileURLToPath(new URL(`./${skill.name}/`, skillsRoot))
      return {
        name: skill.name,
        description: skill.description,
        invocation: skill.invocation,
        provider: provider.name,
        source: 'bundled',
        resourceBase: { kind: 'directory', path: directory },
        rank: BUNDLED_SKILL_RANK,
        locator: { path: fileURLToPath(new URL(`./${skill.name}/SKILL.md`, skillsRoot)), directory },
      }
    })
  },
  async get (candidate) {
    const skill = manifest.skills.find((entry) => entry.name === candidate.name)
    if (skill === undefined) return undefined
    const locator = candidate.locator ?? {}
    const bodyPath = typeof locator.path === 'string'
      ? locator.path
      : fileURLToPath(new URL(`./${skill.name}/SKILL.md`, skillsRoot))
    let content
    try {
      content = stripFrontmatter(await readFile(bodyPath, 'utf8'))
    } catch {
      return undefined
    }
    return {
      name: skill.name,
      description: skill.description,
      invocation: skill.invocation,
      provider: provider.name,
      source: 'bundled',
      resourceBase: { kind: 'directory', path: fileURLToPath(new URL(`./${skill.name}/`, skillsRoot)) },
      path: bodyPath,
      content,
    }
  },
}

/**
 * Host-plane service the desktop bundle loader activates: registers the
 * bundled provider on the shared `ctx.skills` registry for this context.
 */
export default class MattpockSkills extends Service {
  static inject = ['skills']

  constructor (ctx) {
    super(ctx, 'mattpock-skills')
    ctx.skills.registerProvider(() => provider)
  }
}
