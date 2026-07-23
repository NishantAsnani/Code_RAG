/**
 * @module folderSignatures
 *
 * Generates text-based folder signatures from file metadata.
 * These signatures are embedded as chunks in the vector store so that
 * folder/module-level questions get good retrieval hits.
 *
 * ZERO LLM calls — everything is deterministic string manipulation.
 */

const path = require('path');

/** Maximum number of definitions to include in a folder signature. */
const MAX_DEFINITIONS = 15;

/** Maximum number of dependency imports to include in a folder signature. */
const MAX_IMPORTS = 10;

/**
 * Groups an array of file metadata objects by their parent folder path.
 *
 * Each unique directory path (including nested ones) gets its own group.
 * Folder paths are normalized to use forward slashes for consistency.
 *
 * @param {Array<{filePath: string, language: string, lineCount: number, imports: string[], exports: string[], definitions: string[], topComments: string[]}>} metadataList
 *   Array of metadata objects produced by metadataExtractor.js.
 * @returns {Map<string, Array<object>>}
 *   A Map where keys are normalized folder paths and values are arrays of
 *   metadata objects belonging to that folder.
 */
function groupByFolder(metadataList) {
  const groups = new Map();

  for (const meta of metadataList) {
    if (!meta || !meta.filePath) continue;

    // Normalize to forward slashes and extract directory
    const normalized = meta.filePath.replace(/\\/g, '/');
    const folder = normalized.substring(0, normalized.lastIndexOf('/')) || '.';

    if (!groups.has(folder)) {
      groups.set(folder, []);
    }
    groups.get(folder).push(meta);
  }

  return groups;
}

/**
 * Generates a human-readable text signature for a single folder.
 *
 * The signature summarizes the folder's contents: file names, languages used,
 * key definitions, external dependencies, and total line count. Definitions
 * are capped at {@link MAX_DEFINITIONS} and imports at {@link MAX_IMPORTS}
 * to keep signatures concise.
 *
 * @param {string} folderPath
 *   The folder path (e.g. "src/auth").
 * @param {Array<{filePath: string, language: string, lineCount: number, imports: string[], exports: string[], definitions: string[], topComments: string[]}>} fileMetas
 *   Array of metadata objects for files in this folder.
 * @returns {string}
 *   A multi-line text description of the folder suitable for embedding.
 *
 * @example
 * // Returns:
 * // Folder: src/auth
 * // Files (2): login.js, register.js
 * // Languages: .js
 * // Key definitions: handleLogin, handleRegister
 * // Dependencies: bcrypt, express
 * // Total lines: 180
 * generateFolderSignature('src/auth', fileMetas);
 */
function generateFolderSignature(folderPath, fileMetas) {
  if (!fileMetas || fileMetas.length === 0) {
    return `Folder: ${folderPath}\nFiles (0): (empty)`;
  }

  // --- File names ---
  const fileNames = fileMetas.map((m) => {
    const normalized = m.filePath.replace(/\\/g, '/');
    return normalized.substring(normalized.lastIndexOf('/') + 1);
  });

  // --- Languages (deduplicated) ---
  const languages = [
    ...new Set(
      fileMetas
        .map((m) => m.language)
        .filter(Boolean)
    ),
  ];

  // --- Key definitions (deduplicated, capped) ---
  const allDefinitions = [];
  for (const m of fileMetas) {
    if (Array.isArray(m.definitions)) {
      for (const d of m.definitions) {
        if (d && !allDefinitions.includes(d)) {
          allDefinitions.push(d);
        }
      }
    }
  }
  const cappedDefinitions = allDefinitions.slice(0, MAX_DEFINITIONS);
  const definitionsExtra =
    allDefinitions.length > MAX_DEFINITIONS
      ? ` (+${allDefinitions.length - MAX_DEFINITIONS} more)`
      : '';

  // --- Dependencies / imports (deduplicated, capped) ---
  const allImports = [];
  for (const m of fileMetas) {
    if (Array.isArray(m.imports)) {
      for (const imp of m.imports) {
        if (imp && !allImports.includes(imp)) {
          allImports.push(imp);
        }
      }
    }
  }
  const cappedImports = allImports.slice(0, MAX_IMPORTS);
  const importsExtra =
    allImports.length > MAX_IMPORTS
      ? ` (+${allImports.length - MAX_IMPORTS} more)`
      : '';

  // --- Total lines ---
  const totalLines = fileMetas.reduce((sum, m) => sum + (m.lineCount || 0), 0);

  // --- Assemble signature ---
  const lines = [
    `Folder: ${folderPath}`,
    `Files (${fileMetas.length}): ${fileNames.join(', ')}`,
  ];

  if (languages.length > 0) {
    lines.push(`Languages: ${languages.join(', ')}`);
  }

  if (cappedDefinitions.length > 0) {
    lines.push(
      `Key definitions: ${cappedDefinitions.join(', ')}${definitionsExtra}`
    );
  }

  if (cappedImports.length > 0) {
    lines.push(
      `Dependencies: ${cappedImports.join(', ')}${importsExtra}`
    );
  }

  lines.push(`Total lines: ${totalLines}`);

  return lines.join('\n');
}

/**
 * Generates folder signatures for every unique folder found in the metadata.
 *
 * Internally calls {@link groupByFolder} to partition the metadata, then
 * {@link generateFolderSignature} for each group.
 *
 * @param {Array<{filePath: string, language: string, lineCount: number, imports: string[], exports: string[], definitions: string[], topComments: string[]}>} metadataList
 *   Full array of metadata objects produced by metadataExtractor.js.
 * @returns {Array<{folder: string, text: string, fileCount: number}>}
 *   One entry per folder, each containing the folder path, its text signature,
 *   and the number of files in that folder.
 */
function generateAllFolderSignatures(metadataList) {
  if (!Array.isArray(metadataList) || metadataList.length === 0) {
    return [];
  }

  const groups = groupByFolder(metadataList);
  const results = [];

  for (const [folder, metas] of groups) {
    results.push({
      folder,
      text: generateFolderSignature(folder, metas),
      fileCount: metas.length,
    });
  }

  return results;
}

/**
 * Generates a visual file-tree string from an array of file objects.
 *
 * Directories are sorted before files at each level.  The tree uses
 * two-space indentation for nesting.
 *
 * @param {Array<{path: string, content?: string}>} files
 *   Array of file objects.  Only the `path` property is used.
 * @returns {string}
 *   A multi-line tree representation suitable for a project overview prompt.
 *
 * @example
 * // Returns:
 * // src/
 * //   auth/
 * //     login.js
 * //     register.js
 * //   utils/
 * //     helpers.js
 * generateFileTree([
 *   { path: 'src/auth/login.js' },
 *   { path: 'src/auth/register.js' },
 *   { path: 'src/utils/helpers.js' },
 * ]);
 */
function generateFileTree(files) {
  if (!Array.isArray(files) || files.length === 0) {
    return '';
  }

  // Build an intermediate tree structure.
  // Each node: { name, children: Map<string, node>, isFile: boolean }
  const root = { name: '', children: new Map(), isFile: false };

  for (const file of files) {
    if (!file || !file.path) continue;

    const normalized = file.path.replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);

    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          children: new Map(),
          isFile: isLast,
        });
      } else if (isLast) {
        // Mark as file if this exact path ends here
        current.children.get(part).isFile = true;
      }

      current = current.children.get(part);
    }
  }

  /**
   * Recursively renders a tree node into indented lines.
   *
   * @param {object} node   - The tree node to render.
   * @param {number} depth  - Current indentation depth.
   * @param {string[]} out  - Accumulator for output lines.
   */
  function render(node, depth, out) {
    // Separate children into directories and files, then sort each group
    const children = [...node.children.values()];

    const dirs = children
      .filter((c) => c.children.size > 0)
      .sort((a, b) => a.name.localeCompare(b.name));

    const leafFiles = children
      .filter((c) => c.children.size === 0 && c.isFile)
      .sort((a, b) => a.name.localeCompare(b.name));

    const indent = '  '.repeat(depth);

    // Render directories first
    for (const dir of dirs) {
      out.push(`${indent}${dir.name}/`);
      render(dir, depth + 1, out);
    }

    // Then files
    for (const f of leafFiles) {
      out.push(`${indent}${f.name}`);
    }
  }

  const lines = [];
  render(root, 0, lines);
  return lines.join('\n');
}

module.exports = {
  groupByFolder,
  generateFolderSignature,
  generateAllFolderSignatures,
  generateFileTree,
};
