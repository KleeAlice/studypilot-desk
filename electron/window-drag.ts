export function dpiCoordinateGrid(scaleFactor: number): number {
  if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) return 1;
  for (let grid = 1; grid <= 8; grid += 1) {
    if (Math.abs(scaleFactor * grid - Math.round(scaleFactor * grid)) < 1e-6) return grid;
  }
  return 1;
}

export function snapCoordinateToDpiGrid(value: number, scaleFactor: number): number {
  const grid = dpiCoordinateGrid(scaleFactor);
  return Math.round(value / grid) * grid;
}

export function contentDimensionForStableOuterBounds(
  contentDimension: number,
  outerDimension: number,
  scaleFactor: number,
): number {
  const physicalOuterDimension = outerDimension * scaleFactor;
  const isWholePhysicalPixel = Math.abs(physicalOuterDimension - Math.round(physicalOuterDimension)) < 1e-6;
  return Math.max(1, contentDimension - (isWholePhysicalPixel ? 0 : 1));
}
