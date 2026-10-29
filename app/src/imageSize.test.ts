import { Image } from "expo-image";
import {
  getKnownImageSize,
  measureImage,
  resetImageSizeCache,
} from "./imageSize";
import { MAX_EXPANDED_IMAGE_EDGE } from "./expandedImageSize";

function mockLoad(width: number, height: number) {
  const release = jest.fn();
  const spy = jest
    .spyOn(Image, "loadAsync")
    .mockResolvedValue({ width, height, release } as never);
  return { spy, release };
}

describe("measureImage", () => {
  beforeEach(() => {
    resetImageSizeCache();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("measures through expo-image with the decode capped at the largest displayed edge", async () => {
    // Arrange
    const { spy } = mockLoad(800, 600);

    // Act
    const size = await measureImage("https://example.com/a.jpg");

    // Assert
    expect(size).toEqual({ width: 800, height: 600 });
    expect(spy).toHaveBeenCalledWith(
      { uri: "https://example.com/a.jpg" },
      {
        maxWidth: MAX_EXPANDED_IMAGE_EDGE,
        maxHeight: MAX_EXPANDED_IMAGE_EDGE,
      }
    );
  });

  it("measures each URL once, sharing an in-flight measurement", async () => {
    // Arrange
    const { spy } = mockLoad(800, 600);

    // Act
    await Promise.all([
      measureImage("https://example.com/a.jpg"),
      measureImage("https://example.com/a.jpg"),
    ]);
    await measureImage("https://example.com/a.jpg");

    // Assert
    expect(spy).toHaveBeenCalledTimes(1);
    expect(getKnownImageSize("https://example.com/a.jpg")).toEqual({
      width: 800,
      height: 600,
    });
  });

  it("releases the decoded bitmap once the size is known", async () => {
    // Arrange
    const { release } = mockLoad(800, 600);

    // Act
    await measureImage("https://example.com/a.jpg");

    // Assert
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("reports an image that fails to load as failed, and remembers it", async () => {
    // Arrange
    const spy = jest
      .spyOn(Image, "loadAsync")
      .mockRejectedValue(new Error("404"));

    // Act
    const first = await measureImage("https://example.com/missing.jpg");
    const second = await measureImage("https://example.com/missing.jpg");

    // Assert
    expect(first).toBe("failed");
    expect(second).toBe("failed");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("treats a zero-sized decode as failed", async () => {
    // Arrange
    mockLoad(0, 0);

    // Act
    const size = await measureImage("https://example.com/empty.jpg");

    // Assert
    expect(size).toBe("failed");
  });
});
