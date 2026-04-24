export type PipTilePlacement = {
  gridColumn: string
  gridRow: number
}

export type PipGridLayout = {
  cols: number
  rows: number
  /** Number of CSS sub-columns; use as `repeat(subColumns, 1fr)`. */
  subColumns: number
  /** One entry per tile, in input order. */
  placements: PipTilePlacement[]
}

/**
 * Target tile aspect ratio used to score candidate grid shapes.
 *
 * Video sources are 16:9, but picking 16:9 as the target makes the
 * scorer indifferent between a stretched 2-col slab (aspect ~2.7) and a
 * squarer 3-col tile (aspect ~1.2) because log distance is symmetric.
 * The UI works better with square, face-friendly tiles. This target keeps
 * wide windows from collapsing to 2 columns with short, stretched rows
 * and pushes the scorer to add a column instead.
 */
const TARGET_TILE_ASPECT = 1

/**
 * Smallest count from which we force at least two columns.
 * For 1-3 participants it is acceptable to stack vertically in tall
 * windows, but from 4 people onwards we keep >=2 columns to
 * avoid endless vertical scrolling; the scorer handles the rest.
 */
const FORCE_TWO_COLS_COUNT = 4

const pickGridShape = (
  count: number,
  width: number,
  height: number
): { cols: number; rows: number } => {
  if (count <= 1) return { cols: 1, rows: Math.max(1, count) }
  if (width <= 0 || height <= 0) return { cols: count, rows: 1 }

  const minCols = count >= FORCE_TWO_COLS_COUNT ? 2 : 1

  let best = {
    cols: minCols,
    rows: Math.ceil(count / minCols),
    score: -Infinity,
  }
  for (let cols = minCols; cols <= count; cols++) {
    const rows = Math.ceil(count / cols)
    const tileW = width / cols
    const tileH = height / rows
    if (tileW <= 0 || tileH <= 0) continue

    // Score: aspect close to target, few empty cells, large tile area,
    // and a tiny bias toward fewer rows so ties (perfectly square shapes)
    // resolve in favour of a shorter, wider grid.
    const aspectScore = -Math.abs(Math.log(tileW / tileH / TARGET_TILE_ASPECT))
    const emptyCells = cols * rows - count
    const fillScore = -emptyCells * 0.1
    const areaScore = Math.log(tileW * tileH) * 0.5
    const rowsPenalty = -rows * 0.01

    const score = aspectScore * 2 + fillScore + areaScore + rowsPenalty
    if (score > best.score) best = { cols, rows, score }
  }
  return { cols: best.cols, rows: best.rows }
}

/**
 * Pure function. Given a tile count and stage dimensions, returns the CSS
 * grid layout for the PiP stage:
 *
 *  - picks a cols x rows shape close to 16:9 tiles,
 *  - stretches any partial last row so its tiles share the full row width
 *    (no empty cells, no small centered tile).
 *
 * Callers consume the result directly: `subColumns` feeds
 * `grid-template-columns: repeat(N, 1fr)` and each tile reads its own
 * `gridColumn`/`gridRow` from `placements`.
 */
export const computePipGridLayout = (
  count: number,
  width: number,
  height: number
): PipGridLayout => {
  if (count <= 0) {
    return { cols: 1, rows: 1, subColumns: 1, placements: [] }
  }

  const { cols, rows } = pickGridShape(count, width, height)
  const tilesInLastRow = count - cols * (rows - 1)
  const hasPartialRow = tilesInLastRow > 0 && tilesInLastRow < cols

  const subColumns = hasPartialRow ? cols * tilesInLastRow : cols
  const fullRowSpan = hasPartialRow ? tilesInLastRow : 1
  const lastRowSpan = hasPartialRow ? cols : 1

  const placements: PipTilePlacement[] = []
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols)
    const colIndex = i % cols
    const isLastRow = row === rows - 1 && hasPartialRow
    const span = isLastRow ? lastRowSpan : fullRowSpan
    const colStart = colIndex * span + 1
    placements.push({
      gridColumn: `${colStart} / span ${span}`,
      gridRow: row + 1,
    })
  }

  return { cols, rows, subColumns, placements }
}
