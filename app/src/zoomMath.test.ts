import {
  clampTranslate,
  clampZoom,
  dismissBackdropOpacity,
  DISMISS_DISTANCE,
  DISMISS_VELOCITY,
  MAX_ZOOM,
  MIN_ZOOM,
  shouldDismiss,
  translateForZoom,
} from "./zoomMath";

// Screen position of image point `p` under translate `t` and scale `s`,
// relative to the view's centre — the model the viewer's transform uses.
const onScreen = (p: number, t: number, s: number) => t + s * p;

describe("clampZoom", () => {
  it("keeps zoom between the minimum and maximum", () => {
    expect(clampZoom(0.4)).toBe(MIN_ZOOM);
    expect(clampZoom(3)).toBe(3);
    expect(clampZoom(12)).toBe(MAX_ZOOM);
  });
});

describe("translateForZoom", () => {
  it("keeps the image point under the fingers in place as the zoom changes", () => {
    // Arrange — fingers 80px right of centre, image already zoomed and panned.
    const focal = 80;
    const fromScale = 1.5;
    const fromTranslate = -20;
    const pointUnderFingers = (focal - fromTranslate) / fromScale;

    // Act
    const translate = translateForZoom(focal, fromTranslate, fromScale, 3);

    // Assert
    expect(onScreen(pointUnderFingers, translate, 3)).toBeCloseTo(focal);
  });

  it("does not move the image when pinching at its centre from rest", () => {
    expect(translateForZoom(0, 0, 1, 4)).toBeCloseTo(0);
  });
});

describe("clampTranslate", () => {
  it("lets a zoomed image pan only until its edge meets the view's edge", () => {
    // At 2× a 400px view shows a 800px image: 200px of slack either side.
    expect(clampTranslate(500, 2, 400)).toBe(200);
    expect(clampTranslate(-500, 2, 400)).toBe(-200);
    expect(clampTranslate(120, 2, 400)).toBe(120);
  });

  it("allows no panning at normal zoom", () => {
    expect(clampTranslate(60, 1, 400)).toBe(0);
  });
});

describe("shouldDismiss", () => {
  it("closes on a long enough drag or a fast enough flick", () => {
    expect(shouldDismiss(DISMISS_DISTANCE + 1, 0)).toBe(true);
    expect(shouldDismiss(-(DISMISS_DISTANCE + 1), 0)).toBe(true);
    expect(shouldDismiss(30, DISMISS_VELOCITY + 1)).toBe(true);
  });

  it("springs back from a short, slow drag", () => {
    expect(shouldDismiss(40, 200)).toBe(false);
  });
});

describe("dismissBackdropOpacity", () => {
  it("fades the backdrop as the image is dragged away, never below zero", () => {
    expect(dismissBackdropOpacity(0)).toBe(1);
    expect(dismissBackdropOpacity(DISMISS_DISTANCE)).toBeLessThan(1);
    expect(dismissBackdropOpacity(10_000)).toBe(0);
  });
});
