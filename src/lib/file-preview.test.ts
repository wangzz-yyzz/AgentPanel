import { describe, expect, it } from "vitest";
import {
  fileBaseNameFromPath,
  fileExtensionFromPath,
  isDocxPreviewPath,
  isImagePreviewPath,
  isMarkdownPreviewPath,
  isMediaPreviewPath,
  isPdfPreviewPath,
  isPresentationPreviewPath,
  isSpreadsheetPreviewPath,
  isTextPreviewPath,
  previewKindForPath
} from "./file-preview";

describe("file preview classification", () => {
  it("detects markdown variants", () => {
    expect(isMarkdownPreviewPath("notes/README.md")).toBe(true);
    expect(isMarkdownPreviewPath("notes/guide.markdown")).toBe(true);
    expect(isMarkdownPreviewPath("notes/spec.mkd")).toBe(true);
    expect(previewKindForPath("notes/spec.mdown")).toBe("markdown");
  });

  it("detects image variants", () => {
    expect(isImagePreviewPath("assets/logo.png")).toBe(true);
    expect(isImagePreviewPath("assets/photo.JPEG")).toBe(true);
    expect(isImagePreviewPath("assets/diagram.svg")).toBe(true);
    expect(isImagePreviewPath("assets/icon.avif")).toBe(true);
    expect(previewKindForPath("assets/mockup.webp")).toBe("image");
  });

  it("detects pdf files", () => {
    expect(isPdfPreviewPath("docs/report.pdf")).toBe(true);
    expect(isPdfPreviewPath("docs/REPORT.PDF")).toBe(true);
    expect(previewKindForPath("docs/report.pdf")).toBe("pdf");
  });

  it("detects docx, spreadsheet, presentation, and media files", () => {
    expect(isDocxPreviewPath("docs/brief.docx")).toBe(true);
    expect(isSpreadsheetPreviewPath("data/model.xlsx")).toBe(true);
    expect(isSpreadsheetPreviewPath("data/export.csv")).toBe(true);
    expect(isPresentationPreviewPath("slides/demo.pptx")).toBe(true);
    expect(isMediaPreviewPath("media/demo.mp4")).toBe(true);
    expect(isMediaPreviewPath("media/voice.mp3")).toBe(true);
    expect(previewKindForPath("docs/brief.docx")).toBe("docx");
    expect(previewKindForPath("data/model.xlsx")).toBe("spreadsheet");
    expect(previewKindForPath("slides/demo.pptx")).toBe("presentation");
    expect(previewKindForPath("media/demo.mp4")).toBe("media");
  });

  it("detects code, config, shell, and extensionless text files", () => {
    expect(isTextPreviewPath("src/main.tsx")).toBe(true);
    expect(isTextPreviewPath("backend/service.rs")).toBe(true);
    expect(isTextPreviewPath("scripts/setup.ps1")).toBe(true);
    expect(isTextPreviewPath("config/app.yaml")).toBe(true);
    expect(isTextPreviewPath("config/.env.local")).toBe(true);
    expect(isTextPreviewPath("Dockerfile")).toBe(true);
    expect(isTextPreviewPath("Makefile")).toBe(true);
    expect(isTextPreviewPath(".gitignore")).toBe(true);
    expect(isTextPreviewPath("Jenkinsfile")).toBe(true);
    expect(isTextPreviewPath("CMakeLists.txt")).toBe(true);
    expect(isTextPreviewPath("notes/output.log")).toBe(true);
    expect(previewKindForPath("src/main.tsx")).toBe("text");
  });

  it("does not classify unsupported binaries as previewable text", () => {
    expect(previewKindForPath("archive/build.zip")).toBeUndefined();
    expect(previewKindForPath("bin/app.exe")).toBeUndefined();
    expect(previewKindForPath("archive/data.7z")).toBeUndefined();
  });

  it("normalizes basename and extension parsing", () => {
    expect(fileExtensionFromPath("E:\\front\\AgentPanel\\src\\main.TSX")).toBe("tsx");
    expect(fileBaseNameFromPath("E:\\front\\AgentPanel\\.env.production")).toBe(".env.production");
  });
});
