import {
  extractGifEmbedUrl,
  extractGiphyId,
  extractRedgifsId,
  getGiphyEmbedUrl,
  getRedgifsEmbedUrl,
} from "./gifUtils";

describe("extractRedgifsId", () => {
  it("extracts ID from www.redgifs.com watch URL", () => {
    expect(
      extractRedgifsId("https://www.redgifs.com/watch/TightCalculatingAurochs")
    ).toBe("TightCalculatingAurochs");
  });

  it("extracts ID from bare redgifs.com watch URL", () => {
    expect(
      extractRedgifsId("https://redgifs.com/watch/FriendlyBouncyCockerspaniel")
    ).toBe("FriendlyBouncyCockerspaniel");
  });

  it("returns null for a non-watch redgifs URL", () => {
    expect(extractRedgifsId("https://www.redgifs.com/browse")).toBeNull();
  });

  it("returns null for a non-redgifs URL", () => {
    expect(
      extractRedgifsId("https://www.youtube.com/watch?v=abc123")
    ).toBeNull();
  });

  it("returns null for null input", () => {
    expect(extractRedgifsId(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(extractRedgifsId(undefined)).toBeNull();
  });

  it("returns null for an invalid URL", () => {
    expect(extractRedgifsId("not a url")).toBeNull();
  });
});

describe("getRedgifsEmbedUrl", () => {
  it("builds the ifr embed URL", () => {
    expect(getRedgifsEmbedUrl("TightCalculatingAurochs")).toBe(
      "https://www.redgifs.com/ifr/TightCalculatingAurochs"
    );
  });
});

describe("extractGiphyId", () => {
  it("extracts ID from giphy.com/gifs slug URL", () => {
    expect(
      extractGiphyId("https://giphy.com/gifs/cat-jumping-xT9IgG50Lg7KXYNX8I")
    ).toBe("xT9IgG50Lg7KXYNX8I");
  });

  it("extracts ID from giphy.com/gifs URL with no slug prefix", () => {
    expect(extractGiphyId("https://giphy.com/gifs/xT9IgG50Lg7KXYNX8I")).toBe(
      "xT9IgG50Lg7KXYNX8I"
    );
  });

  it("extracts ID from giphy.com/clips URL", () => {
    expect(
      extractGiphyId("https://giphy.com/clips/funny-dog-3o7aD2sAAjXnO2NXAS")
    ).toBe("3o7aD2sAAjXnO2NXAS");
  });

  it("extracts ID from media.giphy.com/media URL", () => {
    expect(
      extractGiphyId(
        "https://media.giphy.com/media/3o7aD2sAAjXnO2NXAS/giphy.gif"
      )
    ).toBe("3o7aD2sAAjXnO2NXAS");
  });

  it("returns null for a non-giphy URL", () => {
    expect(extractGiphyId("https://www.reddit.com/r/gifs")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(extractGiphyId(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(extractGiphyId(undefined)).toBeNull();
  });

  it("returns null for an invalid URL", () => {
    expect(extractGiphyId("not a url")).toBeNull();
  });
});

describe("getGiphyEmbedUrl", () => {
  it("builds the embed URL", () => {
    expect(getGiphyEmbedUrl("xT9IgG50Lg7KXYNX8I")).toBe(
      "https://giphy.com/embed/xT9IgG50Lg7KXYNX8I"
    );
  });
});

describe("extractGifEmbedUrl", () => {
  it("returns a Redgifs embed URL for a Redgifs watch URL", () => {
    expect(extractGifEmbedUrl("https://www.redgifs.com/watch/TightGif")).toBe(
      "https://www.redgifs.com/ifr/TightGif"
    );
  });

  it("returns a Giphy embed URL for a Giphy gifs URL", () => {
    expect(
      extractGifEmbedUrl("https://giphy.com/gifs/funny-cat-xT9IgG50Lg7KXYNX8I")
    ).toBe("https://giphy.com/embed/xT9IgG50Lg7KXYNX8I");
  });

  it("returns null for an unrecognised URL", () => {
    expect(extractGifEmbedUrl("https://www.reddit.com/r/gifs")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(extractGifEmbedUrl(null)).toBeNull();
  });
});
