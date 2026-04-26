export const MAX_EXPANDED_IMAGE_EDGE = 1024;

export type ExpandedImageSize = {
  width: number;
  height: number;
};

export function getExpandedImageSize(
  sourceWidth: number,
  sourceHeight: number,
  containerWidth?: number
): ExpandedImageSize {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return { width: 0, height: 0 };
  }

  const maxWidth =
    typeof containerWidth === "number" && containerWidth > 0
      ? Math.min(MAX_EXPANDED_IMAGE_EDGE, containerWidth)
      : MAX_EXPANDED_IMAGE_EDGE;

  const scale = Math.min(
    1,
    maxWidth / sourceWidth,
    MAX_EXPANDED_IMAGE_EDGE / sourceHeight
  );

  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}
