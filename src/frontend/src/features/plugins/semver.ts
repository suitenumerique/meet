/**
 * Minimal semver check (no dependency): supports only the caret form `^x.y.z`.
 * True iff `version` has the same major and is >= the floor; anything else false.
 */

const CARET_RANGE = /^\^(\d+)\.(\d+)\.(\d+)$/
const VERSION = /^(\d+)\.(\d+)\.(\d+)/

export const satisfies = (version: string, range: string): boolean => {
  const r = CARET_RANGE.exec(range)
  if (!r) return false
  const v = VERSION.exec(version)
  if (!v) return false

  const [rMajor, rMinor, rPatch] = [Number(r[1]), Number(r[2]), Number(r[3])]
  const [vMajor, vMinor, vPatch] = [Number(v[1]), Number(v[2]), Number(v[3])]

  if (vMajor !== rMajor) return false
  if (vMinor !== rMinor) return vMinor > rMinor
  return vPatch >= rPatch
}
