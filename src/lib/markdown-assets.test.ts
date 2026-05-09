import { describe, expect, it } from "vitest";
import {
  LOCAL_MARKDOWN_ASSET_PROTOCOL,
  createLocalMarkdownAssetUrl,
  decodeLocalMarkdownAssetUrl,
  isLocalMarkdownAssetReference,
  normalizeFileSystemPath,
  resolveMarkdownAssetPath
} from "./markdown-assets";

describe("markdown asset helpers", () => {
  it("normalizes Windows and relative filesystem paths", () => {
    expect(normalizeFileSystemPath("E:\\front\\AgentPanel\\docs\\..\\assets\\diagram.png")).toBe("E:/front/AgentPanel/assets/diagram.png");
    expect(normalizeFileSystemPath("./docs/../images/cover.png")).toBe("images/cover.png");
  });

  it("detects local markdown asset references", () => {
    expect(isLocalMarkdownAssetReference("./images/cover.png")).toBe(true);
    expect(isLocalMarkdownAssetReference("assets/cover.png")).toBe(true);
    expect(isLocalMarkdownAssetReference("E:/front/AgentPanel/assets/cover.png")).toBe(true);
    expect(isLocalMarkdownAssetReference("file:///E:/front/AgentPanel/assets/cover.png")).toBe(true);
    expect(isLocalMarkdownAssetReference("https://example.com/cover.png")).toBe(false);
    expect(isLocalMarkdownAssetReference("//cdn.example.com/cover.png")).toBe(false);
  });

  it("resolves relative markdown asset paths against the markdown file path", () => {
    const sourcePath = "E:\\front\\AgentPanel\\docs\\guide.md";
    expect(resolveMarkdownAssetPath(sourcePath, "./images/cover.png")).toBe("E:/front/AgentPanel/docs/images/cover.png");
    expect(resolveMarkdownAssetPath(sourcePath, "../shared/diagram.png")).toBe("E:/front/AgentPanel/shared/diagram.png");
    expect(resolveMarkdownAssetPath(sourcePath, "assets/My%20Diagram.png")).toBe("E:/front/AgentPanel/docs/assets/My Diagram.png");
  });

  it("resolves Windows rooted and file url markdown asset paths", () => {
    const sourcePath = "E:\\front\\AgentPanel\\docs\\guide.md";
    expect(resolveMarkdownAssetPath(sourcePath, "/assets/cover.png")).toBe("E:/assets/cover.png");
    expect(resolveMarkdownAssetPath(sourcePath, "\\assets\\cover.png")).toBe("E:/assets/cover.png");
    expect(resolveMarkdownAssetPath(sourcePath, "file:///E:/front/AgentPanel/assets/cover.png")).toBe("E:/front/AgentPanel/assets/cover.png");
  });

  it("encodes and decodes local markdown asset urls", () => {
    const assetUrl = createLocalMarkdownAssetUrl("E:\\front\\AgentPanel\\assets\\cover image.png");
    expect(assetUrl.startsWith(`${LOCAL_MARKDOWN_ASSET_PROTOCOL}:`)).toBe(true);
    expect(decodeLocalMarkdownAssetUrl(assetUrl)).toBe("E:/front/AgentPanel/assets/cover image.png");
  });
});
