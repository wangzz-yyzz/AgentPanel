export type FilePreviewKind = "markdown" | "text" | "image" | "pdf";

const markdownExtensions = new Set([
  "md",
  "markdown",
  "mdown",
  "mkd",
  "mkdn",
  "mdtxt",
  "mdtext"
]);

const imageExtensions = new Set([
  "png",
  "jpg",
  "jpeg",
  "jfif",
  "gif",
  "webp",
  "svg",
  "bmp",
  "ico",
  "avif"
]);

const pdfExtensions = new Set(["pdf"]);

const textExtensions = new Set([
  "txt",
  "text",
  "log",
  "out",
  "err",
  "conf",
  "config",
  "cfg",
  "ini",
  "properties",
  "prop",
  "toml",
  "yaml",
  "yml",
  "json",
  "jsonc",
  "json5",
  "xml",
  "xsd",
  "xsl",
  "plist",
  "env",
  "lock",
  "gitignore",
  "gitattributes",
  "editorconfig",
  "ignore",
  "dockerignore",
  "npmignore",
  "eslintignore",
  "prettierignore",
  "stylelintignore",
  "csv",
  "tsv",
  "sql",
  "graphql",
  "gql",
  "proto",
  "tex",
  "bib",
  "rst",
  "adoc",
  "asciidoc",
  "c",
  "h",
  "i",
  "ii",
  "cc",
  "cp",
  "cpp",
  "cxx",
  "c++",
  "hh",
  "hpp",
  "hxx",
  "inl",
  "ipp",
  "m",
  "mm",
  "swift",
  "java",
  "kt",
  "kts",
  "scala",
  "sc",
  "groovy",
  "gradle",
  "go",
  "rs",
  "zig",
  "nim",
  "dart",
  "cs",
  "fs",
  "fsi",
  "fsx",
  "vb",
  "py",
  "pyi",
  "ipynb",
  "rb",
  "gemspec",
  "rake",
  "php",
  "phpt",
  "phtml",
  "lua",
  "pl",
  "pm",
  "t",
  "r",
  "rmd",
  "jl",
  "sh",
  "bash",
  "zsh",
  "fish",
  "ksh",
  "ps1",
  "psm1",
  "psd1",
  "bat",
  "cmd",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "mts",
  "cts",
  "vue",
  "svelte",
  "astro",
  "html",
  "htm",
  "xhtml",
  "css",
  "scss",
  "sass",
  "less",
  "styl",
  "pcss",
  "clj",
  "cljs",
  "cljc",
  "edn",
  "ex",
  "exs",
  "erl",
  "hrl",
  "hs",
  "lhs",
  "ml",
  "mli",
  "diff",
  "patch",
  "service",
  "socket",
  "target",
  "mount",
  "timer",
  "desktop"
]);

const textBaseNames = new Set([
  "dockerfile",
  "containerfile",
  "makefile",
  "gnumakefile",
  "cmakelists.txt",
  "justfile",
  "tiltfile",
  "vagrantfile",
  "jenkinsfile",
  "brewfile",
  "gemfile",
  "rakefile",
  "pipfile",
  "procfile",
  "podfile",
  "fastfile",
  "cartfile",
  "meson.build",
  "meson_options.txt",
  "license",
  "copying",
  "readme",
  "changelog",
  "changes",
  "authors",
  "contributors",
  "notice",
  "todo",
  "codeowners",
  ".env",
  ".env.example",
  ".env.sample",
  ".env.local",
  ".env.development",
  ".env.production",
  ".env.test",
  ".gitignore",
  ".gitattributes",
  ".gitmodules",
  ".dockerignore",
  ".npmrc",
  ".yarnrc",
  ".yarnrc.yml",
  ".pnpmfile.cjs",
  ".editorconfig",
  ".eslintignore",
  ".eslintrc",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.json",
  ".eslintrc.yaml",
  ".eslintrc.yml",
  ".prettierrc",
  ".prettierrc.js",
  ".prettierrc.cjs",
  ".prettierrc.json",
  ".prettierrc.yaml",
  ".prettierrc.yml",
  ".prettierignore",
  ".stylelintrc",
  ".stylelintrc.js",
  ".stylelintrc.cjs",
  ".stylelintrc.json",
  ".stylelintrc.yaml",
  ".stylelintrc.yml",
  ".stylelintignore",
  ".babelrc",
  ".babelrc.js",
  ".babelrc.cjs",
  ".browserslistrc",
  ".npmignore",
  ".bashrc",
  ".zshrc",
  ".vimrc",
  ".nvmrc",
  ".tool-versions",
  ".python-version",
  ".ruby-version",
  ".node-version",
  ".terraformrc",
  ".coveragerc"
]);

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").trim().toLowerCase();
}

export function fileExtensionFromPath(path: string) {
  const normalized = normalizePath(path);
  const fileName = normalized.split("/").filter(Boolean).pop() ?? normalized;
  const lastDot = fileName.lastIndexOf(".");
  return lastDot > 0 ? fileName.slice(lastDot + 1) : "";
}

export function fileBaseNameFromPath(path: string) {
  const normalized = normalizePath(path);
  return normalized.split("/").filter(Boolean).pop() ?? normalized;
}

export function isMarkdownPreviewPath(path: string) {
  return markdownExtensions.has(fileExtensionFromPath(path));
}

export function isImagePreviewPath(path: string) {
  return imageExtensions.has(fileExtensionFromPath(path));
}

export function isPdfPreviewPath(path: string) {
  return pdfExtensions.has(fileExtensionFromPath(path));
}

export function isTextPreviewPath(path: string) {
  const extension = fileExtensionFromPath(path);
  if (textExtensions.has(extension)) {
    return true;
  }

  const baseName = fileBaseNameFromPath(path);
  if (textBaseNames.has(baseName)) {
    return true;
  }

  if (baseName.startsWith(".env.")) {
    return true;
  }

  return false;
}

export function previewKindForPath(path: string): FilePreviewKind | undefined {
  if (isMarkdownPreviewPath(path)) {
    return "markdown";
  }
  if (isImagePreviewPath(path)) {
    return "image";
  }
  if (isPdfPreviewPath(path)) {
    return "pdf";
  }
  if (isTextPreviewPath(path)) {
    return "text";
  }
  return undefined;
}
