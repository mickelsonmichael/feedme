import { Image } from "expo-image";

type SizeCallback = (
  uri: string,
  success?: (width: number, height: number) => void,
  failure?: (error: Error) => void
) => void;

/**
 * Mocks the image measurement in src/imageSize.ts (expo-image's
 * `Image.loadAsync`) with a callback-style implementation, so a test can
 * resolve, fail, or hold a measurement exactly when it wants to.
 */
export function mockImageSize(impl: SizeCallback) {
  return jest.spyOn(Image, "loadAsync").mockImplementation(
    (source) =>
      new Promise((resolve, reject) => {
        const uri =
          typeof source === "string" ? source : (source as { uri: string }).uri;
        impl(
          uri,
          (width, height) =>
            resolve({ width, height, release: () => {} } as never),
          (error) => reject(error)
        );
      })
  );
}
