import { useEffect } from "react";
import { FileImage, FileText, LoaderCircle, ScrollText, X } from "lucide-react";
import { MarkdownDocument } from "./MarkdownDocument";
import { useAppStore } from "../state/store";

function previewMeta(kind: "markdown" | "text" | "image") {
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

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
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
          ) : preview.kind === "text" ? (
            <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-5 py-5">
              <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-6 text-slate-700">
                {preview.content?.trim().length ? preview.content : "This text file is empty."}
              </pre>
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
