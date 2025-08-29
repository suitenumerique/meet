export const isSubsetOf = <T>(
  subset: T[],
  superset: T[] | undefined
): boolean => {
  if (!superset || superset.length === 0) {
    return subset.length === 0
  }
  if (!subset || subset.length === 0) {
    return true
  }
  return subset.every((item) => superset.includes(item))
}
