import ReactMarkdown, { type Components } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema, type Options as SanitizeOptions } from "rehype-sanitize";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

type MarkdownDocumentProps = {
  markdown: string;
  emptyMessage?: string;
  className?: string;
};

function mergeClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

const markdownSanitizeSchema: SanitizeOptions = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "audio", "iframe", "video"],
  attributes: {
    ...defaultSchema.attributes,
    audio: [...(defaultSchema.attributes?.audio ?? []), "controls", "loop", "muted", "preload", "src"],
    iframe: [
      ...(defaultSchema.attributes?.iframe ?? []),
      "allow",
      "allowFullScreen",
      "frameBorder",
      "height",
      "loading",
      "referrerPolicy",
      "sandbox",
      "src",
      "title",
      "width"
    ],
    video: [
      ...(defaultSchema.attributes?.video ?? []),
      "autoPlay",
      "controls",
      "height",
      "loop",
      "muted",
      "playsInline",
      "poster",
      "preload",
      "src",
      "width"
    ]
  },
  protocols: {
    ...defaultSchema.protocols,
    src: [...(defaultSchema.protocols?.src ?? ["http", "https"])]
  }
};

const markdownComponents = {
  h1: ({ children, className, ...props }) => <h1 {...props} className={mergeClasses("text-3xl font-semibold tracking-[-0.04em] text-slate-950", className)}>{children}</h1>,
  h2: ({ children, className, ...props }) => (
    <h2
      {...props}
      className={mergeClasses(className?.includes("sr-only") ? "sr-only" : "text-2xl font-semibold tracking-[-0.03em] text-slate-900", className && !className.includes("sr-only") ? className : undefined)}
    >
      {children}
    </h2>
  ),
  h3: ({ children, className, ...props }) => <h3 {...props} className={mergeClasses("text-xl font-semibold tracking-[-0.02em] text-slate-900", className)}>{children}</h3>,
  h4: ({ children, className, ...props }) => <h4 {...props} className={mergeClasses("text-lg font-semibold text-slate-900", className)}>{children}</h4>,
  h5: ({ children, className, ...props }) => <h5 {...props} className={mergeClasses("text-base font-semibold uppercase tracking-[0.12em] text-slate-700", className)}>{children}</h5>,
  h6: ({ children, className, ...props }) => <h6 {...props} className={mergeClasses("text-sm font-semibold uppercase tracking-[0.16em] text-slate-500", className)}>{children}</h6>,
  p: ({ children, className, ...props }) => <p {...props} className={mergeClasses("leading-7 text-slate-700", className)}>{children}</p>,
  strong: ({ children, ...props }) => <strong {...props} className="font-semibold text-slate-950">{children}</strong>,
  em: ({ children, ...props }) => <em {...props} className="italic text-slate-800">{children}</em>,
  del: ({ children, ...props }) => <del {...props} className="text-slate-400 line-through">{children}</del>,
  s: ({ children, ...props }) => <s {...props} className="text-slate-400 line-through">{children}</s>,
  a: ({ children, href, ...props }) => (
    <a
      {...props}
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-brand-blue underline decoration-brand-blue/30 underline-offset-4 transition hover:decoration-brand-blue"
    >
      {children}
    </a>
  ),
  blockquote: ({ children, className, ...props }) => (
    <blockquote {...props} className={mergeClasses("rounded-r-[20px] border-l-4 border-brand-blue/50 bg-brand-surface px-4 py-3 text-slate-700", className)}>
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-0 border-t border-slate-200" />,
  ul: ({ children, className }) => (
    <ul
      className={mergeClasses(
        className?.includes("contains-task-list") ? "list-none pl-0" : "list-disc pl-6",
        "space-y-2 text-slate-700 marker:text-slate-400"
      )}
    >
      {children}
    </ul>
  ),
  ol: ({ children, className, start }) => (
    <ol
      start={start}
      className={mergeClasses(
        className?.includes("contains-task-list") ? "list-none pl-0" : "list-decimal pl-6",
        "space-y-2 text-slate-700 marker:text-slate-400"
      )}
    >
      {children}
    </ol>
  ),
  li: ({ children, className }) => (
    <li className={className?.includes("task-list-item") ? "flex items-start gap-2 pl-0" : "pl-1"}>{children}</li>
  ),
  input: ({ checked }) => (
    <input
      type="checkbox"
      checked={checked}
      disabled
      readOnly
      className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-blue"
    />
  ),
  pre: ({ children, className, ...props }) => (
    <pre {...props} className={mergeClasses("overflow-x-auto rounded-[22px] bg-[#0f172a] px-4 py-4 text-[13px] leading-6 text-slate-100 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.14)]", className)}>
      {children}
    </pre>
  ),
  code: ({ children, className, ...props }) => {
    const value = String(children).replace(/\n$/, "");
    const isBlock = Boolean(className?.includes("language-") || value.includes("\n"));

    return (
      <code
        {...props}
        className={
          isBlock
            ? "font-mono text-[13px] text-slate-100"
            : "rounded-lg bg-slate-200/70 px-1.5 py-0.5 font-mono text-[0.95em] text-brand-blue"
        }
      >
        {value}
      </code>
    );
  },
  table: ({ children, className, ...props }) => (
    <div className="overflow-x-auto rounded-[22px] border border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <table {...props} className={mergeClasses("min-w-full border-collapse text-left text-sm text-slate-700", className)}>{children}</table>
    </div>
  ),
  thead: ({ children, className, ...props }) => <thead {...props} className={mergeClasses("bg-slate-50 text-slate-900", className)}>{children}</thead>,
  tbody: ({ children, className, ...props }) => <tbody {...props} className={mergeClasses("divide-y divide-slate-200", className)}>{children}</tbody>,
  tr: ({ children, className, ...props }) => <tr {...props} className={mergeClasses("align-top", className)}>{children}</tr>,
  th: ({ children, align, ...props }) => (
    <th {...props} align={align} className="border-b border-slate-200 px-4 py-3 font-semibold">
      {children}
    </th>
  ),
  td: ({ children, align, ...props }) => (
    <td {...props} align={align} className="px-4 py-3 leading-6">
      {children}
    </td>
  ),
  img: ({ src, alt, className, ...props }) => (
    <img
      {...props}
      src={src}
      alt={alt ?? ""}
      loading="lazy"
      className={mergeClasses("max-h-[480px] max-w-full rounded-[20px] border border-slate-200 bg-white object-contain shadow-[0_10px_24px_rgba(15,23,42,0.05)]", className)}
    />
  ),
  details: ({ children, className, ...props }) => <details {...props} className={mergeClasses("rounded-[20px] border border-slate-200 bg-white px-4 py-3", className)}>{children}</details>,
  summary: ({ children, className, ...props }) => <summary {...props} className={mergeClasses("cursor-pointer list-none font-semibold text-slate-900", className)}>{children}</summary>,
  kbd: ({ children, ...props }) => (
    <kbd {...props} className="rounded-lg border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[0.92em] text-slate-700 shadow-[inset_0_-1px_0_rgba(148,163,184,0.18)]">
      {children}
    </kbd>
  ),
  sub: ({ children, ...props }) => <sub {...props}>{children}</sub>,
  sup: ({ children, ...props }) => <sup {...props}>{children}</sup>,
  section: ({ children, className, ...props }) => (
    <section
      {...props}
      className={mergeClasses(
        className?.includes("footnotes")
          ? "mt-6 rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-4"
          : undefined,
        className
      )}
    >
      {children}
    </section>
  ),
  iframe: ({ src, title, className, ...props }) => (
    <iframe
      {...props}
      src={src}
      title={title ?? "Embedded content"}
      loading="lazy"
      sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      className={mergeClasses("min-h-[360px] w-full rounded-[20px] border border-slate-200 bg-white", className)}
    />
  ),
  video: ({ children, src, poster, className, ...props }) => (
    <video {...props} controls src={src} poster={poster} className={mergeClasses("max-h-[520px] w-full rounded-[20px] border border-slate-200 bg-black", className)}>
      {children}
    </video>
  ),
  audio: ({ children, src, className, ...props }) => (
    <audio {...props} controls src={src} className={mergeClasses("w-full", className)}>
      {children}
    </audio>
  )
} satisfies Components;

export function MarkdownDocument({
  markdown,
  emptyMessage = "Nothing to preview yet.",
  className = "space-y-4"
}: MarkdownDocumentProps) {
  if (!markdown.trim()) {
    return <div className="text-sm text-slate-400">{emptyMessage}</div>;
  }

  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        remarkRehypeOptions={{ allowDangerousHtml: true }}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, markdownSanitizeSchema]]}
        components={markdownComponents}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
