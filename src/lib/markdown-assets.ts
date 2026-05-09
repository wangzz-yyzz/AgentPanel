export const LOCAL_MARKDOWN_ASSET_PROTOCOL = "agentpanel-local";

function stripQueryAndHash(reference: string) {
  const queryIndex = reference.indexOf("?");
  const hashIndex = reference.indexOf("#");
  const endIndex = [queryIndex, hashIndex].filter((index) => index >= 0).sort((left, right) => left - right)[0] ?? reference.length;
  return reference.slice(0, endIndex);
}

function decodePathReference(reference: string) {
  if (!reference.includes("%")) {
    return reference;
  }

  try {
    return decodeURI(reference);
  } catch {
    return reference;
  }
}

function splitPathRoot(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const driveMatch = normalized.match(/^[a-zA-Z]:\//);
  if (driveMatch) {
    return {
      root: driveMatch[0],
      remainder: normalized.slice(driveMatch[0].length)
    };
  }

  if (normalized.startsWith("//")) {
    const withoutPrefix = normalized.slice(2);
    const parts = withoutPrefix.split("/").filter(Boolean);
    if (parts.length >= 2) {
      return {
        root: `//${parts[0]}/${parts[1]}/`,
        remainder: parts.slice(2).join("/")
      };
    }

    return {
      root: "//",
      remainder: withoutPrefix.replace(/^\/+/, "")
    };
  }

  if (normalized.startsWith("/")) {
    return {
      root: "/",
      remainder: normalized.slice(1)
    };
  }

  return {
    root: "",
    remainder: normalized
  };
}

export function normalizeFileSystemPath(path: string) {
  const trimmed = path.trim();
  if (!trimmed) {
    return "";
  }

  const { root, remainder } = splitPathRoot(trimmed);
  const resolvedSegments: string[] = [];

  for (const segment of remainder.split("/")) {
    if (!segment || segment === ".") {
      continue;
    }

    if (segment === "..") {
      if (resolvedSegments.length > 0 && resolvedSegments[resolvedSegments.length - 1] !== "..") {
        resolvedSegments.pop();
      } else if (!root) {
        resolvedSegments.push("..");
      }
      continue;
    }

    resolvedSegments.push(segment);
  }

  if (!root) {
    return resolvedSegments.join("/") || ".";
  }

  if (resolvedSegments.length === 0) {
    return root;
  }

  return `${root}${resolvedSegments.join("/")}`;
}

function directoryPathFromFilePath(path: string) {
  const normalized = normalizeFileSystemPath(path);
  const { root, remainder } = splitPathRoot(normalized);
  const segments = remainder.split("/").filter(Boolean);

  if (segments.length <= 1) {
    return root || ".";
  }

  if (!root) {
    return segments.slice(0, -1).join("/");
  }

  return `${root}${segments.slice(0, -1).join("/")}`;
}

function joinFileSystemPath(basePath: string, relativePath: string) {
  const normalizedBasePath = normalizeFileSystemPath(basePath);
  if (!normalizedBasePath || normalizedBasePath === ".") {
    return normalizeFileSystemPath(relativePath);
  }

  const trimmedBasePath =
    normalizedBasePath === "/" || /^[a-zA-Z]:\/$/.test(normalizedBasePath) || normalizedBasePath.startsWith("//")
      ? normalizedBasePath
      : normalizedBasePath.replace(/\/+$/, "");

  if (trimmedBasePath === "/") {
    return normalizeFileSystemPath(`/${relativePath}`);
  }

  return normalizeFileSystemPath(`${trimmedBasePath}/${relativePath}`);
}

function driveRootFromPath(path: string) {
  const normalized = normalizeFileSystemPath(path);
  const match = normalized.match(/^[a-zA-Z]:\//);
  return match?.[0];
}

function urlSchemeFromReference(reference: string) {
  const match = reference.match(/^([a-zA-Z][a-zA-Z\d+.-]*):/);
  return match?.[1]?.toLowerCase();
}

function fileUrlToPath(reference: string) {
  try {
    const parsed = new URL(reference);
    if (parsed.protocol !== "file:") {
      return undefined;
    }

    const decodedPath = decodeURIComponent(parsed.pathname);
    if (parsed.host && parsed.host !== "localhost") {
      return normalizeFileSystemPath(`\\\\${parsed.host}${decodedPath.replace(/\//g, "\\")}`);
    }

    if (/^\/[a-zA-Z]:\//.test(decodedPath)) {
      return normalizeFileSystemPath(decodedPath.slice(1));
    }

    return normalizeFileSystemPath(decodedPath);
  } catch {
    return undefined;
  }
}

export function isLocalMarkdownAssetReference(reference: string) {
  const trimmed = stripQueryAndHash(reference.trim());
  if (!trimmed || trimmed.startsWith("#")) {
    return false;
  }

  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) {
    return true;
  }

  if (trimmed.startsWith("\\\\")) {
    return true;
  }

  if (trimmed.startsWith("./") || trimmed.startsWith("../") || trimmed.startsWith(".\\") || trimmed.startsWith("..\\")) {
    return true;
  }

  if (trimmed.startsWith("\\") || trimmed.startsWith("/")) {
    return !trimmed.startsWith("//");
  }

  const scheme = urlSchemeFromReference(trimmed);
  if (scheme) {
    return scheme === "file";
  }

  return !trimmed.startsWith("//");
}

export function resolveMarkdownAssetPath(sourcePath: string | undefined, reference: string) {
  const trimmed = stripQueryAndHash(reference.trim());
  if (!trimmed || trimmed.startsWith("#") || !isLocalMarkdownAssetReference(trimmed)) {
    return undefined;
  }

  if (urlSchemeFromReference(trimmed) === "file") {
    return fileUrlToPath(trimmed);
  }

  const decodedReference = decodePathReference(trimmed);
  if (/^[a-zA-Z]:[\\/]/.test(decodedReference) || decodedReference.startsWith("\\\\")) {
    return normalizeFileSystemPath(decodedReference);
  }

  if (decodedReference.startsWith("\\") || decodedReference.startsWith("/")) {
    const driveRoot = sourcePath ? driveRootFromPath(sourcePath) : undefined;
    if (driveRoot) {
      return normalizeFileSystemPath(`${driveRoot}${decodedReference.slice(1)}`);
    }
    return normalizeFileSystemPath(decodedReference);
  }

  if (!sourcePath?.trim()) {
    return undefined;
  }

  return joinFileSystemPath(directoryPathFromFilePath(sourcePath), decodedReference);
}

export function createLocalMarkdownAssetUrl(path: string) {
  return `${LOCAL_MARKDOWN_ASSET_PROTOCOL}:${encodeURIComponent(normalizeFileSystemPath(path))}`;
}

export function decodeLocalMarkdownAssetUrl(reference: string) {
  const prefix = `${LOCAL_MARKDOWN_ASSET_PROTOCOL}:`;
  if (!reference.startsWith(prefix)) {
    return undefined;
  }

  const encodedPath = reference.slice(prefix.length);
  try {
    return normalizeFileSystemPath(decodeURIComponent(encodedPath));
  } catch {
    return normalizeFileSystemPath(encodedPath);
  }
}
