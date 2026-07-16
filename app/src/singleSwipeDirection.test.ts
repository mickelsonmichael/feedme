import {
  resolveSingleSwipeDirection,
  SINGLE_SWIPE_DISTANCE_THRESHOLD,
  SINGLE_SWIPE_VELOCITY_THRESHOLD,
} from "./singleSwipeDirection";

describe("resolveSingleSwipeDirection", () => {
  it("returns null when the swipe is below both the distance and velocity thresholds", () => {
    // Arrange
    const translationX = 10;
    const translationY = 0;
    const velocityX = 100;

    // Act
    const result = resolveSingleSwipeDirection(
      translationX,
      translationY,
      velocityX
    );

    // Assert
    expect(result).toBeNull();
  });

  it("returns 'next' for a leftward swipe that clears the distance threshold", () => {
    // Arrange
    const translationX = -(SINGLE_SWIPE_DISTANCE_THRESHOLD + 1);
    const translationY = 0;
    const velocityX = 0;

    // Act
    const result = resolveSingleSwipeDirection(
      translationX,
      translationY,
      velocityX
    );

    // Assert
    expect(result).toBe("next");
  });

  it("returns 'previous' for a rightward swipe that clears the distance threshold", () => {
    // Arrange
    const translationX = SINGLE_SWIPE_DISTANCE_THRESHOLD + 1;
    const translationY = 0;
    const velocityX = 0;

    // Act
    const result = resolveSingleSwipeDirection(
      translationX,
      translationY,
      velocityX
    );

    // Assert
    expect(result).toBe("previous");
  });

  it("returns a direction for a fast short flick that clears only the velocity threshold", () => {
    // Arrange
    const translationX = -10;
    const translationY = 0;
    const velocityX = -(SINGLE_SWIPE_VELOCITY_THRESHOLD + 1);

    // Act
    const result = resolveSingleSwipeDirection(
      translationX,
      translationY,
      velocityX
    );

    // Assert
    expect(result).toBe("next");
  });

  it("returns null for a swipe that is more vertical than horizontal, regardless of thresholds", () => {
    // Arrange
    const translationX = SINGLE_SWIPE_DISTANCE_THRESHOLD + 1;
    const translationY = SINGLE_SWIPE_DISTANCE_THRESHOLD + 50;
    const velocityX = SINGLE_SWIPE_VELOCITY_THRESHOLD + 1;

    // Act
    const result = resolveSingleSwipeDirection(
      translationX,
      translationY,
      velocityX
    );

    // Assert
    expect(result).toBeNull();
  });

  it("returns null exactly at the distance and velocity thresholds (thresholds are exclusive)", () => {
    // Arrange
    const translationX = -SINGLE_SWIPE_DISTANCE_THRESHOLD;
    const translationY = 0;
    const velocityX = -SINGLE_SWIPE_VELOCITY_THRESHOLD;

    // Act
    const result = resolveSingleSwipeDirection(
      translationX,
      translationY,
      velocityX
    );

    // Assert
    expect(result).toBeNull();
  });
});
