import {
  getExpandedImageSize,
  MAX_EXPANDED_IMAGE_EDGE,
} from "./expandedImageSize";

describe("getExpandedImageSize", () => {
  it("returns the original size when the image is already within the limits", () => {
    // Arrange
    const sourceWidth = 640;
    const sourceHeight = 480;

    // Act
    const result = getExpandedImageSize(sourceWidth, sourceHeight);

    // Assert
    expect(result).toEqual({ width: 640, height: 480 });
  });

  it("caps landscape images at the maximum width while preserving aspect ratio", () => {
    // Arrange
    const sourceWidth = 2048;
    const sourceHeight = 1024;

    // Act
    const result = getExpandedImageSize(sourceWidth, sourceHeight);

    // Assert
    expect(result).toEqual({ width: MAX_EXPANDED_IMAGE_EDGE, height: 512 });
  });

  it("caps portrait images at the maximum height while preserving aspect ratio", () => {
    // Arrange
    const sourceWidth = 1200;
    const sourceHeight = 2400;

    // Act
    const result = getExpandedImageSize(sourceWidth, sourceHeight);

    // Assert
    expect(result).toEqual({ width: 512, height: MAX_EXPANDED_IMAGE_EDGE });
  });

  it("also respects a narrower container width", () => {
    // Arrange
    const sourceWidth = 1000;
    const sourceHeight = 500;
    const containerWidth = 300;

    // Act
    const result = getExpandedImageSize(
      sourceWidth,
      sourceHeight,
      containerWidth
    );

    // Assert
    expect(result).toEqual({ width: 300, height: 150 });
  });

  it("never rounds a constrained dimension down to zero", () => {
    // Arrange
    const sourceWidth = 1;
    const sourceHeight = 3000;

    // Act
    const result = getExpandedImageSize(sourceWidth, sourceHeight);

    // Assert
    expect(result).toEqual({ width: 1, height: MAX_EXPANDED_IMAGE_EDGE });
  });
});
