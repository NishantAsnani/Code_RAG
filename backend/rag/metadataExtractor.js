/**
 * @module metadataExtractor
 *
 * Extracts structural metadata from source code files without any LLM calls.
 * Designed for use in a RAG pipeline that processes GitHub repositories.
 *
 * Supports import/export/definition extraction for:
 *   JS/TS, Python, Java, Go, Rust, C/C++
 */

const path = require('path');

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_IMPORTS = 15;
const MAX_EXPORTS = 15;
const MAX_DEFINITIONS = 20;
const MAX_DEFINITION_LENGTH = 120;
const MAX_TOP_COMMENT_LINES = 10;

// ─── Import Patterns (by language family) ────────────────────────────────────

/**
 * Regex patterns used to detect import/require statements across languages.
 * Each pattern uses the global + multiline flags so it can match every
 * occurrence in a file.
 */
const IMPORT_PATTERNS = [
  // JS/TS: import ... from '...'  |  import '...'
  /^\s*import\s+.+?\s+from\s+['"].+?['"]/gm,
  /^\s*import\s+['"].+?['"]/gm,
  // JS/TS: const/let/var x = require('...')
  /^\s*(?:const|let|var)\s+.+?=\s*require\s*\(.+?\)/gm,
  // Python: import x  |  from x import y
  /^\s*import\s+\S+/gm,
  /^\s*from\s+\S+\s+import\s+.+/gm,
  // Java: import ...;
  /^\s*import\s+[\w.*]+\s*;/gm,
  // Go: import "..."  |  import ( ... ) handled line-by-line below
  /^\s*import\s+["(].+/gm,
  // Rust: use ...;
  /^\s*use\s+[\w:]+.+;/gm,
  // C/C++: #include <...> | #include "..."
  /^\s*#include\s+[<"].+?[>"]/gm,
];

// ─── Export Patterns ─────────────────────────────────────────────────────────


const EXPORT_PATTERNS = [
  // export default ...
  /^\s*export\s+default\s+.+/gm,
  // export { ... }
  /^\s*export\s*\{[^}]*\}/gm,
  // export const/let/var/function/class/async ...
  /^\s*export\s+(?:const|let|var|function\*?|class|async\s+function\*?|interface|type|enum)\s+\S+/gm,
  // module.exports = ...  |  module.exports.x = ...
  /^\s*module\.exports\s*(?:\.\w+)?\s*=/gm,
  // exports.x = ...
  /^\s*exports\.\w+\s*=/gm,
];

// ─── Definition Patterns ─────────────────────────────────────────────────────

/**
 * Regex patterns used to extract function, class, and variable definitions
 * across supported languages.
 */
const DEFINITION_PATTERNS = [
  // JS/TS: async function, function, class (with optional export)
  /^\s*(?:export\s+)?(?:default\s+)?async\s+function\*?\s+\w+.*/gm,
  /^\s*(?:export\s+)?(?:default\s+)?function\*?\s+\w+.*/gm,
  /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+\w+.*/gm,
  // JS/TS: const/let/var assignment (top-level looking)
  /^\s*(?:export\s+)?(?:const|let|var)\s+\w+\s*=/gm,
  // Python: def, class
  /^\s*(?:async\s+)?def\s+\w+.*/gm,
  /^\s*class\s+\w+.*/gm,
  // Go: func
  /^\s*func\s+\(?\w+.*/gm,
  // Rust: fn, pub fn, struct, enum, impl, trait
  /^\s*(?:pub\s+)?(?:async\s+)?fn\s+\w+.*/gm,
  /^\s*(?:pub\s+)?(?:struct|enum|impl|trait)\s+\w+.*/gm,
  // Java/C#/Kotlin: public/private/protected methods & classes
  /^\s*(?:public|private|protected)\s+(?:static\s+)?(?:final\s+)?(?:abstract\s+)?(?:class|interface|enum|void|int|long|double|float|boolean|char|byte|short|String|\w+)\s+\w+.*/gm,
];

// ─── Top-Comment Patterns ────────────────────────────────────────────────────

/**
 * Checks whether a single line looks like a comment.
 * Handles //, /*, *, #, and """ / ''' (Python docstrings).
 *
 * @param {string} line - A single source line.
 * @returns {boolean}
 */
function isCommentLine(line) {
  const trimmed = line.trimStart();
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('"""') ||
    trimmed.startsWith("'''")
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Runs an array of regex patterns against `content` and returns up to `cap`
 * unique, trimmed matches.
 *
 * @param {string}   content  - The full file text.
 * @param {RegExp[]} patterns - Array of RegExp objects (must use /g flag).
 * @param {number}   cap      - Maximum number of results to return.
 * @returns {string[]}
 */
function matchPatterns(content, patterns, cap) {
  /** @type {Set<string>} */
  const seen = new Set();
  const results = [];

  for (const pattern of patterns) {
    // Reset lastIndex for safety (patterns are reused across calls)
    pattern.lastIndex = 0;

    let match;
    while ((match = pattern.exec(content)) !== null) {
      const value = match[0].trim();
      if (value && !seen.has(value)) {
        seen.add(value);
        results.push(value);
        if (results.length >= cap) return results;
      }
    }
  }

  return results;
}

/**
 * Derives a simple language identifier from a file extension.
 *
 * @param {string} filePath - The file path to inspect.
 * @returns {string} A lowercase language/extension string (e.g. "js", "py").
 */
function detectLanguage(filePath) {
  const ext = path.extname(filePath).replace('.', '').toLowerCase();
  return ext || 'unknown';
}

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Extracts structural metadata from a single source file.
 *
 * @param {string} filePath - Relative or absolute path to the file.
 * @param {string} content  - The full text content of the file.
 * @returns {{
 *   filePath:     string,
 *   language:     string,
 *   lineCount:    number,
 *   imports:      string[],
 *   exports:      string[],
 *   definitions:  string[],
 *   topComments:  string[]
 * }}
 */
function extractFileMetadata(filePath, content) {
  const lines = content.split('\n');

  // --- imports ---
  const imports = matchPatterns(content, IMPORT_PATTERNS, MAX_IMPORTS);

  // --- exports ---
  const exports = matchPatterns(content, EXPORT_PATTERNS, MAX_EXPORTS);

  // --- definitions (truncated to MAX_DEFINITION_LENGTH) ---
  const rawDefs = matchPatterns(content, DEFINITION_PATTERNS, MAX_DEFINITIONS);
  const definitions = rawDefs.map((d) =>
    d.length > MAX_DEFINITION_LENGTH
      ? d.slice(0, MAX_DEFINITION_LENGTH) + '…'
      : d
  );

  // --- top comments ---
  const topComments = [];
  for (const line of lines) {
    if (isCommentLine(line)) {
      topComments.push(line.trimEnd());
      if (topComments.length >= MAX_TOP_COMMENT_LINES) break;
    } else if (line.trim() === '') {
      // Allow blank lines at the very top before comments start, but stop
      // once we've collected at least one comment and hit a non-comment line.
      if (topComments.length > 0) break;
    } else {
      break;
    }
  }

  return {
    filePath,
    language: detectLanguage(filePath),
    lineCount: lines.length,
    imports,
    exports,
    definitions,
    topComments,
  };
}

/**
 * Extracts metadata for every file in the provided array.
 *
 * @param {{ path: string, content: string }[]} files
 *   Array of file objects, typically fetched from the GitHub API.
 * @returns {Array<ReturnType<typeof extractFileMetadata>>}
 *   Array of metadata objects, one per input file.
 */
function extractAllMetadata(files) {
  if (!Array.isArray(files)) {
    throw new TypeError('extractAllMetadata expects an array of file objects');
  }

  return files.map((file) => extractFileMetadata(file.path, file.content));
}

/**
 * Heuristically scores a file's importance within a repository.
 *
 * Higher scores indicate files that are likely more relevant for
 * understanding the overall codebase (entry points, routes, models, etc.).
 *
 * Scoring rules:
 *  - Entry points  (index, main, app, server, entry in name) : +10
 *  - Config files   (config, setup, env, .env in name)       : +5
 *  - Route / controller / handler / middleware                : +8
 *  - Model / schema / entity                                  : +6
 *  - Number of exports × 2                                    : (cap +10)
 *  - lineCount / 50                                           : (cap +5)
 *  - Has top comments                                         : +2
 *  - Test files                                               : −5
 *
 * @param {{
 *   filePath:    string,
 *   lineCount:   number,
 *   exports:     string[],
 *   topComments: string[]
 * }} meta - A metadata object produced by `extractFileMetadata`.
 * @returns {number} The computed importance score.
 */
function scoreFileImportance(meta) {
  let score = 0;
  const basename = path.basename(meta.filePath).toLowerCase();
  const dirPath = meta.filePath.toLowerCase();

  // Entry points
  if (/(?:^|\W)(index|main|app|server|entry)(?:\.\w+)?$/i.test(basename)) {
    score += 10;
  }

  // Config files
  if (/(?:^|\W)(config|setup|\.env|env)(?:\.\w+)?$/i.test(basename)) {
    score += 5;
  }

  // Route / controller / handler / middleware
  if (/(route|controller|handler|middleware)/i.test(dirPath)) {
    score += 8;
  }

  // Model / schema / entity
  if (/(model|schema|entity)/i.test(dirPath)) {
    score += 6;
  }

  // Exports contribution (capped at 10)
  score += Math.min(meta.exports.length * 2, 10);

  // Line count contribution (capped at 5)
  score += Math.min(Math.floor(meta.lineCount / 50), 5);

  // Top comments bonus
  if (meta.topComments && meta.topComments.length > 0) {
    score += 2;
  }

  // Test file penalty
  if (/(test|spec|__tests__|__mocks__)/i.test(dirPath)) {
    score -= 5;
  }

  return score;
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  extractFileMetadata,
  extractAllMetadata,
  scoreFileImportance,
};
