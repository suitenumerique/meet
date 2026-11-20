#!/usr/bin/env node
/**
 * Mirrors the colors of the La Suite UI kit into Panda token files.
 *
 * The UI kit (https://github.com/suitenumerique/ui-kit) is the source of truth
 * for our design tokens. It publishes them as CSS custom properties in the
 * stylesheet of `@gouvfr-lasuite/ui-components`, one block per theme. This
 * script reads one theme out of that stylesheet and rewrites:
 *
 *   src/styles/theme/ui-kit/colors.ts       the kit's `globals.colors`
 *   src/styles/theme/ui-kit/contextuals.ts  the kit's `contextuals` (light/dark)
 *
 * Usage:
 *   npm run theme:sync                       re-generate from the pinned release
 *   npm run theme:sync -- --version 1.6.0    move to another release of the kit
 *   npm run theme:sync -- --theme default    mirror another theme of the kit
 *   npm run theme:sync -- --css ./style.css  read a stylesheet from disk
 *
 * When moving to another release, also update UI_KIT_VERSION below so that the
 * next run stays on it.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import prettier from 'prettier'

const UI_KIT_PACKAGE = '@gouvfr-lasuite/ui-components'
const UI_KIT_VERSION = '1.5.0'
/** `default` is the white-label theme of the kit, `dsfr` and `anct` the others. */
const UI_KIT_THEME = 'dsfr'

const FRONTEND_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT_DIR = join(FRONTEND_DIR, 'src/styles/theme/ui-kit')

const GLOBAL_COLOR_PREFIX = '--c--globals--colors--'
const CONTEXTUAL_PREFIX = '--c--contextuals--'

/** Downloads the published package and returns the content of its stylesheet. */
function fetchStylesheet(version) {
  const workdir = mkdtempSync(join(tmpdir(), 'ui-kit-'))
  try {
    const [{ filename }] = JSON.parse(
      execFileSync(
        'npm',
        [
          'pack',
          `${UI_KIT_PACKAGE}@${version}`,
          '--pack-destination',
          workdir,
          '--json',
          '--loglevel=error',
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }
      )
    )
    execFileSync('tar', [
      '-xzf',
      join(workdir, filename),
      '-C',
      workdir,
      'package/dist/style.css',
    ])
    return readFileSync(join(workdir, 'package/dist/style.css'), 'utf8')
  } finally {
    rmSync(workdir, { recursive: true, force: true })
  }
}

/**
 * Returns the custom properties each theme declares, keyed by theme name.
 *
 * The kit declares its default theme on `:root` (the bare token engine also
 * ships one on `html`, which `:root` out-specifies) and the other themes in
 * `.cunningham-theme--<name>` blocks. These blocks are flat, a regex is enough.
 */
function parseThemes(css) {
  const themeClassPrefix = '.cunningham-theme--'
  const themes = {}
  for (const [, selector, body] of css.matchAll(
    /(:root|html|\.cunningham-theme--[a-z0-9-]+)\s*\{([^{}]*)\}/g
  )) {
    const declarations = Object.fromEntries(
      [...body.matchAll(/(--c--[\w-]+)\s*:\s*([^;}]+)/g)].map(
        ([, name, value]) => [name, value.trim()]
      )
    )
    if (Object.keys(declarations).length === 0) continue
    const theme = selector.startsWith(themeClassPrefix)
      ? selector.slice(themeClassPrefix.length)
      : 'default'
    themes[theme] = { ...themes[theme], ...declarations }
  }
  return themes
}

/**
 * Returns what the browser resolves for the light and dark variants of a theme.
 *
 * A theme class only re-declares what it changes: the rest cascades from the
 * default theme, hence the merge.
 */
function resolveVariants(themes, theme) {
  const [lightName, darkName] =
    theme === 'default'
      ? ['default', 'dark']
      : [`${theme}-light`, `${theme}-dark`]
  for (const name of [lightName, darkName]) {
    if (!themes[name]) {
      throw new Error(
        `theme "${name}" not found, the stylesheet declares: ` +
          Object.keys(themes).join(', ')
      )
    }
  }
  return {
    light: { ...themes.default, ...themes[lightName] },
    dark: { ...themes.default, ...themes[darkName] },
  }
}

/** `brand-550` -> `['brand', '550']`, `blue-1-050` -> `['blue-1', '050']` */
function splitColorName(name) {
  const match = name.match(/^(.+)-(\d{3,4})$/)
  return match ? [match[1], match[2]] : [name]
}

/**
 * Trees are Maps rather than objects: an object would move the integer-like
 * keys first ('100' before '050'), and we want to keep the order of the kit.
 */
function setIn(tree, path, value) {
  let node = tree
  for (const key of path.slice(0, -1)) {
    if (!node.has(key)) node.set(key, new Map())
    node = node.get(key)
  }
  node.set(path.at(-1), value)
}

function collectColors({ light, dark }) {
  const colors = new Map()
  for (const [name, value] of Object.entries(light)) {
    if (!name.startsWith(GLOBAL_COLOR_PREFIX)) continue
    if (dark[name] !== value) {
      throw new Error(
        `${name} differs between the light and dark variants, ` +
          'while both are expected to share their palettes'
      )
    }
    setIn(colors, splitColorName(name.slice(GLOBAL_COLOR_PREFIX.length)), value)
  }
  return colors
}

/** `var(--c--globals--colors--brand-550)` -> `brand.550` */
function toColorReference(name, value) {
  const match = value?.match(/^var\(--c--globals--colors--([\w-]+)\)$/)
  if (!match) {
    throw new Error(`${name} should refer to a color, got "${value}"`)
  }
  return splitColorName(match[1]).join('.')
}

function collectContextuals({ light, dark }) {
  const contextuals = new Map()
  for (const [name, value] of Object.entries(light)) {
    if (!name.startsWith(CONTEXTUAL_PREFIX)) continue
    setIn(contextuals, name.slice(CONTEXTUAL_PREFIX.length).split('--'), {
      light: toColorReference(name, value),
      dark: toColorReference(name, dark[name]),
    })
  }
  return contextuals
}

const formatKey = (key) => (/^[a-zA-Z_$][\w$]*$/.test(key) ? key : `'${key}'`)

/** Serializes a tree of tokens, `leaf` rendering what sits at the end of a path. */
function serialize(tree, leaf) {
  const entries = [...tree].map(([key, node]) => {
    const value = node instanceof Map ? serialize(node, leaf) : leaf(node)
    return `${formatKey(key)}: ${value}`
  })
  return `{ ${entries.join(', ')} }`
}

const count = (tree) =>
  [...tree.values()].reduce(
    (total, node) => total + (node instanceof Map ? count(node) : 1),
    0
  )

const renderHeader = ({ theme, source }) => `/**
 * GENERATED FILE, do not edit by hand.
 *
 * Mirrors the "${theme}" theme of the La Suite UI kit.
 * Source: ${source}
 * To update it, run \`npm run theme:sync\` (see scripts/sync-ui-kit-tokens.mjs).
 */`

const renderColors = (origin, colors) => `${renderHeader(origin)}
import { defineTokens } from '@pandacss/dev'

/**
 * The palettes of the UI kit, its \`globals.colors\`.
 *
 * Prefer the contextual tokens in components: they carry a role and follow the
 * light/dark theme, where a palette step is a fixed color.
 */
export const colors = defineTokens.colors(
  ${serialize(colors, (hex) => `{ value: '${hex}' }`)}
)
`

const renderContextuals = (origin, contextuals) => `${renderHeader(origin)}
import { defineSemanticTokens } from '@pandacss/dev'

/**
 * A token whose color depends on the theme: the light value applies by
 * default, \`data-theme\` scopes switch it (see ../conditions.ts).
 */
const themed = (light: string, dark: string) => ({
  value: {
    base: \`{colors.\${light}}\`,
    _light: \`{colors.\${light}}\`,
    _dark: \`{colors.\${dark}}\`,
  },
})

/**
 * The contextual tokens of the UI kit, its \`contextuals\`.
 *
 * They read as \`<what is painted>.<family>.<role>.<emphasis>\`, for instance
 * \`background.semantic.brand.primary\` or \`content.semantic.neutral.secondary\`.
 */
export const contextuals = defineSemanticTokens.colors(
  ${serialize(contextuals, ({ light, dark }) => `themed('${light}', '${dark}')`)}
)
`

async function write(filename, code) {
  const filepath = join(OUTPUT_DIR, filename)
  const options = await prettier.resolveConfig(filepath)
  writeFileSync(filepath, await prettier.format(code, { ...options, filepath }))
  console.log(`  wrote ${relative(FRONTEND_DIR, filepath)}`)
}

async function main() {
  const { values: args } = parseArgs({
    options: {
      version: { type: 'string', default: UI_KIT_VERSION },
      theme: { type: 'string', default: UI_KIT_THEME },
      css: { type: 'string' },
    },
  })
  const origin = {
    theme: args.theme,
    source: args.css
      ? `a local stylesheet (${relative(FRONTEND_DIR, resolve(args.css))})`
      : `${UI_KIT_PACKAGE}@${args.version}`,
  }
  console.log(`Reading the "${origin.theme}" theme from ${origin.source}`)

  const stylesheet = args.css
    ? readFileSync(args.css, 'utf8')
    : fetchStylesheet(args.version)
  const variants = resolveVariants(parseThemes(stylesheet), args.theme)
  const colors = collectColors(variants)
  const contextuals = collectContextuals(variants)

  await write('colors.ts', renderColors(origin, colors))
  await write('contextuals.ts', renderContextuals(origin, contextuals))
  console.log(
    `Done: ${count(colors)} colors, ${count(contextuals)} contextual tokens.`
  )
}

main().catch((error) => {
  console.error(`\nCould not sync the UI kit tokens: ${error.message}`)
  process.exit(1)
})
