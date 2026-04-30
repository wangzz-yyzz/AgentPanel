import { useEffect } from "react";
import { FileAudio2, FileImage, FileSpreadsheet, FileText, LoaderCircle, MonitorPlay, Presentation, ScrollText, X } from "lucide-react";
import { MarkdownDocument } from "./MarkdownDocument";
import { useAppStore } from "../state/store";

function previewMeta(kind: "markdown" | "text" | "image" | "pdf" | "docx" | "spreadsheet" | "presentation" | "media") {
  switch (kind) {
    case "markdown":
      return {
        label: "Markdown preview",
        loadingLabel: "Loading Markdown preview...",
        Icon: FileText
      };
    case "text":
      return {
        label: "Text / code preview",
        loadingLabel: "Loading text / code preview...",
        Icon: ScrollText
      };
    case "image":
      return {
        label: "Image preview",
        loadingLabel: "Loading image preview...",
        Icon: FileImage
      };
    case "pdf":
      return {
        label: "PDF preview",
        loadingLabel: "Loading PDF preview...",
        Icon: FileText
      };
    case "docx":
      return {
        label: "DOCX preview",
        loadingLabel: "Loading DOCX preview...",
        Icon: FileText
      };
    case "spreadsheet":
      return {
        label: "Spreadsheet preview",
        loadingLabel: "Loading spreadsheet preview...",
        Icon: FileSpreadsheet
      };
    case "presentation":
      return {
        label: "Presentation preview",
        loadingLabel: "Loading presentation preview...",
        Icon: Presentation
      };
    case "media":
      return {
        label: "Media preview",
        loadingLabel: "Loading media preview...",
        Icon: FileAudio2
      };
  }
}

export function FilePreviewDialog() {
  const preview = useAppStore((state) => state.filePreview);
  const closeFilePreview = useAppStore((state) => state.closeFilePreview);

  useEffect(() => {
    if (!preview) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeFilePreview();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeFilePreview, preview]);

  if (!preview) {
    return null;
  }

  const meta = previewMeta(preview.kind);
  const HeaderIcon = meta.Icon;

  return (
    <div
      className="animate-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-[2px]"
      onClick={closeFilePreview}
    >
      <div
        className="animate-modal-card flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.28)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-[linear-gradient(135deg,rgba(15,108,254,0.08),rgba(115,180,255,0.03))] px-5 py-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-blue/15 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-blue">
              <HeaderIcon className="h-3.5 w-3.5" />
              {meta.label}
            </div>
            <div className="mt-3 truncate text-lg font-semibold tracking-[-0.03em] text-slate-900" title={preview.title}>
              {preview.title}
            </div>
            <div className="mt-1 truncate-start text-sm text-slate-500" title={preview.path}>
              {preview.path}
            </div>
          </div>
          <button
            type="button"
            onClick={closeFilePreview}
            className="ui-action shrink-0 rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
            aria-label="Close preview"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="terminal-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {preview.status === "loading" ? (
            <div className="flex min-h-[320px] items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-slate-50/80">
              <div className="inline-flex items-center gap-3 text-sm font-medium text-slate-500">
                <LoaderCircle className="h-5 w-5 animate-spin text-brand-blue" />
                {meta.loadingLabel}
              </div>
            </div>
          ) : preview.status === "error" ? (
            <div className="rounded-[24px] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
              {preview.error || "Unable to load file preview."}
            </div>
          ) : preview.kind === "image" ? (
            <div className="flex min-h-[320px] items-center justify-center rounded-[24px] border border-slate-200 bg-[linear-gradient(135deg,rgba(241,245,249,0.95),rgba(255,255,255,0.98))] p-5">
              {preview.dataUrl ? (
                <img
                  src={preview.dataUrl}
                  alt={preview.title}
                  className="max-h-[68vh] max-w-full rounded-[24px] border border-slate-200 bg-white object-contain shadow-[0_18px_40px_rgba(15,23,42,0.12)]"
                />
              ) : (
                <div className="text-sm text-slate-400">This image file is empty.</div>
              )}
            </div>
          ) : preview.kind === "pdf" ? (
            <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-[linear-gradient(135deg,rgba(241,245,249,0.95),rgba(255,255,255,0.98))] p-2">
              {preview.sourceUrl ? (
                <iframe
                  src={preview.sourceUrl}
                  title={preview.title}
                  className="h-[70vh] w-full rounded-[18px] border border-slate-200 bg-white"
                />
              ) : (
                <div className="flex min-h-[320px] items-center justify-center text-sm text-slate-400">
                  This PDF file is empty.
                </div>
              )}
            </div>
          ) : preview.kind === "text" ? (
            <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-5 py-5">
              <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-6 text-slate-700">
                {preview.content?.trim().length ? preview.content : "This text file is empty."}
              </pre>
            </div>
          ) : preview.kind === "docx" ? (
            <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-5 py-5">
              {preview.html?.trim().length ? (
                <div
                  className="prose prose-slate max-w-none [&_.preview-table]:w-full [&_.preview-table]:border-collapse [&_.preview-table_td]:border [&_.preview-table_td]:border-slate-200 [&_.preview-table_td]:px-3 [&_.preview-table_td]:py-2 [&_p]:my-0 [&_p+*]:mt-3"
                  dangerouslySetInnerHTML={{ __html: preview.html }}
                />
              ) : (
                <div className="text-sm text-slate-400">This DOCX file is empty.</div>
              )}
            </div>
          ) : preview.kind === "spreadsheet" ? (
            <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
                  {preview.table?.sheetName ?? "Sheet1"}
                </span>
                {preview.table?.sheetNames && preview.table.sheetNames.length > 1 ? (
                  <span>{preview.table.sheetNames.length} sheets</span>
                ) : null}
                <span>{preview.table?.totalRows ?? 0} rows</span>
                <span>{preview.table?.totalColumns ?? 0} columns</span>
              </div>
              <div className="terminal-scrollbar overflow-x-auto overflow-y-auto rounded-[18px] border border-slate-200 bg-white">
                <table className="min-w-full border-collapse text-left text-sm text-slate-700">
                  <thead className="sticky top-0 bg-slate-100 text-xs uppercase tracking-[0.14em] text-slate-500">
                    <tr>
                      {(preview.table?.columns.length ? preview.table.columns : ["Column 1"]).map((column, index) => (
                        <th key={`${column}-${index}`} className="border-b border-slate-200 px-3 py-2.5 font-semibold">
                          {column || `Column ${index + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.table?.rows.length ? (
                      preview.table.rows.map((row, rowIndex) => (
                        <tr key={`row-${rowIndex}`} className="odd:bg-white even:bg-slate-50/70">
                          {(preview.table?.columns.length ? preview.table.columns : row).map((_, columnIndex) => (
                            <td key={`cell-${rowIndex}-${columnIndex}`} className="border-b border-slate-100 px-3 py-2 align-top">
                              {row[columnIndex] || ""}
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="px-3 py-6 text-sm text-slate-400" colSpan={preview.table?.columns.length || 1}>
                          This spreadsheet preview has no rows to show.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : preview.kind === "presentation" ? (
            <div className="space-y-3">
              {preview.slides?.length ? (
                preview.slides.map((slide) => (
                  <section key={`slide-${slide.index}`} className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                    <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      <MonitorPlay className="h-4 w-4 text-brand-blue" />
                      Slide {slide.index}
                    </div>
                    <div className="text-base font-semibold text-slate-900">{slide.title || `Slide ${slide.index}`}</div>
                    {slide.bullets.length ? (
                      <ul className="mt-3 space-y-2 pl-5 text-sm leading-6 text-slate-700">
                        {slide.bullets.map((bullet, bulletIndex) => (
                          <li key={`slide-${slide.index}-bullet-${bulletIndex}`}>{bullet}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className="mt-3 text-sm text-slate-400">No text content found on this slide.</div>
                    )}
                  </section>
                ))
              ) : (
                <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-5 py-5 text-sm text-slate-400">
                  This presentation does not contain previewable slide text.
                </div>
              )}
            </div>
          ) : preview.kind === "media" ? (
            <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(135deg,rgba(241,245,249,0.95),rgba(255,255,255,0.98))] p-5">
              {preview.sourceUrl ? (
                preview.mediaMimeType?.startsWith("audio/") ? (
                  <div className="flex min-h-[320px] items-center justify-center">
                    <audio src={preview.sourceUrl} controls className="w-full max-w-2xl" />
                  </div>
                ) : (
                  <video src={preview.sourceUrl} controls className="max-h-[68vh] w-full rounded-[20px] border border-slate-200 bg-black" />
                )
              ) : (
                <div className="flex min-h-[320px] items-center justify-center text-sm text-slate-400">
                  This media file is empty.
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-5 py-5">
              <MarkdownDocument markdown={preview.content ?? ""} emptyMessage="This Markdown file is empty." className="space-y-4" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
