/**
 * @module projectOverview
 *
 * Generates a comprehensive project-level overview with a single LLM call.
 * Synthesizes the overview from folder signatures and file summaries — does
 * NOT require a README file to exist in the project.
 */

'use strict';

/**
 * @typedef {Object} FolderSignature
 * @property {string} folder  - Relative path of the folder.
 * @property {string} text    - Signature text describing the folder's role.
 * @property {number} fileCount - Number of files in the folder.
 */

/**
 * @typedef {Object} FileSummary
 * @property {string} file    - Relative path of the file.
 * @property {string} summary - Short summary of what the file does.
 */

/** Maximum number of folder signatures fed into the prompt. */
const MAX_FOLDER_SIGNATURES = 20;

/** Maximum number of file summaries fed into the prompt. */
const MAX_FILE_SUMMARIES = 15;

/**
 * Builds the LLM prompt that asks for a project overview.
 *
 * The prompt is self-contained: it embeds the most important folder signatures,
 * file summaries, and the full file tree so the model can reason about the
 * project without needing access to a README.
 *
 * @param {FolderSignature[]} folderSignatures - Array of folder signature
 *   objects produced by folderSignatures.js.  Only the top 20 (by relevance /
 *   position) are included in the prompt.
 * @param {FileSummary[]} fileSummaries - Array of file summary objects produced
 *   by selectiveSummarizer.js.  Only the top 15 are included.
 * @param {string} fileTree - A textual directory-tree representation of the
 *   project, produced by folderSignatures.js.
 * @returns {string} The fully-assembled prompt string ready for the LLM.
 */
function buildOverviewPrompt(folderSignatures, fileSummaries, fileTree) {
  const topFolders = (folderSignatures || []).slice(0, MAX_FOLDER_SIGNATURES);
  const topFiles = (fileSummaries || []).slice(0, MAX_FILE_SUMMARIES);

  const sections = [];

  // --- Instruction block ---------------------------------------------------
  sections.push(
    'You are a senior software engineer. Based ONLY on the information below, ' +
    'write a comprehensive project overview in 5-8 sentences.\n' +
    '\n' +
    'The overview MUST cover:\n' +
    '  • What the project does (its purpose / domain)\n' +
    '  • Key technologies, languages, and frameworks used\n' +
    '  • High-level architecture (e.g. client-server, monorepo, CLI tool)\n' +
    '  • Main features and modules\n' +
    '\n' +
    'IMPORTANT: Do NOT assume a README file exists. Derive everything from ' +
    'the folder signatures, file summaries, and file tree provided below.\n' +
    '\n' +
    'Return ONLY the overview text — no headings, no bullet points, no markdown.'
  );

  // --- Folder signatures ----------------------------------------------------
  if (topFolders.length > 0) {
    const folderLines = topFolders.map(
      (f) => `  ${f.folder} (${f.fileCount} files): ${f.text}`
    );
    sections.push(
      '=== Folder Signatures ===\n' + folderLines.join('\n')
    );
  }

  // --- File summaries -------------------------------------------------------
  if (topFiles.length > 0) {
    const fileLines = topFiles.map(
      (f) => `  ${f.file}: ${f.summary}`
    );
    sections.push(
      '=== File Summaries ===\n' + fileLines.join('\n')
    );
  }

  // --- File tree ------------------------------------------------------------
  if (fileTree) {
    sections.push(
      '=== File Tree ===\n' + fileTree
    );
  }

  return sections.join('\n\n');
}

/**
 * Generates a project-level overview by making a single LLM call.
 *
 * When both `folderSignatures` and `fileSummaries` are empty (or missing),
 * the function falls back to a minimal prompt that uses the `fileTree` alone.
 *
 * @param {FolderSignature[]} folderSignatures - Folder signature objects from
 *   folderSignatures.js.
 * @param {FileSummary[]} fileSummaries - File summary objects from
 *   selectiveSummarizer.js.
 * @param {string} fileTree - Textual directory tree of the project.
 * @param {(prompt: string) => Promise<string>} generateFn - Injected async
 *   function that sends the prompt to an LLM and returns the response text.
 * @returns {Promise<string>} The generated project overview string.
 * @throws {Error} If `generateFn` is not a function or if the LLM call fails.
 */
async function generateProjectOverview(
  folderSignatures,
  fileSummaries,
  fileTree,
  generateFn
) {
  if (typeof generateFn !== 'function') {
    throw new Error('generateProjectOverview: generateFn must be a function');
  }

  const hasFolders = Array.isArray(folderSignatures) && folderSignatures.length > 0;
  const hasFiles = Array.isArray(fileSummaries) && fileSummaries.length > 0;

  let prompt;

  if (!hasFolders && !hasFiles) {
    // Minimal fallback — derive what we can from the file tree alone.
    prompt =
      'You are a senior software engineer. Based ONLY on the file tree below, ' +
      'write a brief project overview in 3-5 sentences.\n' +
      '\n' +
      'Cover what the project likely does, its probable tech stack, and its ' +
      'high-level structure.  Do NOT assume a README exists.\n' +
      '\n' +
      'Return ONLY the overview text — no headings, no bullet points, no markdown.\n' +
      '\n' +
      '=== File Tree ===\n' +
      (fileTree || '(no file tree available)');
  } else {
    prompt = buildOverviewPrompt(folderSignatures, fileSummaries, fileTree);
  }

  const overview = await generateFn(prompt);
  return overview;
}

module.exports = {
  buildOverviewPrompt,
  generateProjectOverview,
};
