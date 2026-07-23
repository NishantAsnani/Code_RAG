/**
 * @module selectiveSummarizer
 *
 * Budget-controlled LLM summarization module.
 *
 * Instead of summarizing every file in a project, this module scores files
 * by importance, selects a budget-limited subset, batches them to minimise
 * API calls, and delegates actual generation to an injected LLM function
 * so the pipeline stays provider-agnostic.
 */

'use strict';

// ─── Selection ───────────────────────────────────────────────────────────────

/**
 * Score and select the most important files to summarize.
 *
 * The effective budget is the *smaller* of the explicit `budget` cap and
 * 5 % of the total file count (rounded up), so large repos don't blow
 * through token limits.
 *
 * @param {Array<Object>} metadataList - Array of file-metadata objects
 *   (each must at least contain a `filePath` property).
 * @param {(meta: Object) => number} scoreFn - Pure function that returns a
 *   numeric importance score for a single metadata entry. Higher = more
 *   important.
 * @param {Object}  [opts]            - Options.
 * @param {number}  [opts.budget=50]  - Hard upper-limit on files returned.
 * @returns {Array<Object>} The top-scoring metadata entries, sorted
 *   descending by score.
 */
function selectFilesToSummarize(metadataList, scoreFn, { budget = 50 } = {}) {
  if (!Array.isArray(metadataList) || metadataList.length === 0) {
    return [];
  }

  if (typeof scoreFn !== 'function') {
    throw new TypeError('scoreFn must be a function');
  }

  // Effective budget: 5 % of the list, capped at the explicit budget.
  const effectiveBudget = Math.min(budget, Math.ceil(metadataList.length * 0.05));

  const scored = metadataList.map((meta) => ({
    meta,
    score: scoreFn(meta),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, effectiveBudget).map((entry) => entry.meta);
}

// ─── Batching ────────────────────────────────────────────────────────────────

/**
 * Group the selected files into fixed-size batches with truncated content.
 *
 * @param {Array<Object>} selectedFiles - Metadata objects (must have
 *   `filePath`).
 * @param {Object|Map} fileContents - Mapping of `filePath → content`
 *   (plain object or `Map`).
 * @param {Object}  [opts]                      - Options.
 * @param {number}  [opts.batchSize=5]          - Max files per batch.
 * @param {number}  [opts.maxContentLength=1500] - Max chars kept per file.
 * @returns {Array<Array<{filePath: string, content: string}>>} Array of
 *   batches, each batch being an array of `{ filePath, content }` entries.
 */
function createSummarizationBatches(
  selectedFiles,
  fileContents,
  { batchSize = 5, maxContentLength = 1500 } = {},
) {
  if (!Array.isArray(selectedFiles) || selectedFiles.length === 0) {
    return [];
  }

  /**
   * Resolve content from either a plain object or a Map.
   * @param {string} filePath
   * @returns {string}
   */
  const getContent = (filePath) => {
    if (fileContents instanceof Map) {
      return fileContents.get(filePath) || '';
    }
    return (fileContents && fileContents[filePath]) || '';
  };

  const items = selectedFiles.map((meta) => {
    const filePath = meta.filePath;
    const raw = getContent(filePath);
    const content = raw.length > maxContentLength
      ? raw.slice(0, maxContentLength)
      : raw;

    return { filePath, content };
  });

  const batches = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }

  return batches;
}

// ─── Prompt Building ─────────────────────────────────────────────────────────

/**
 * Build the LLM prompt for a single batch of files.
 *
 * The prompt instructs the model to return a strict JSON array so the
 * response can be parsed deterministically.
 *
 * @param {Array<{filePath: string, content: string}>} batch - One batch
 *   produced by {@link createSummarizationBatches}.
 * @returns {string} The fully-assembled prompt string.
 */
function buildBatchPrompt(batch) {
  if (!Array.isArray(batch) || batch.length === 0) {
    return '';
  }

  const header = [
    'Summarize each of these source code files in 1-2 sentences.',
    'Focus on: what it does, its role in the project, and key exports/functionality.',
    '',
  ].join('\n');

  const fileBlocks = batch
    .map((entry) => `--- ${entry.filePath} ---\n${entry.content}`)
    .join('\n\n');

  const footer = '\n\nReturn ONLY a valid JSON array: [{"file": "path", "summary": "..."}]';

  return header + fileBlocks + footer;
}

// ─── Response Parsing ────────────────────────────────────────────────────────

/**
 * Attempt to parse an LLM response into the expected JSON array.
 *
 * Falls back to a regex-based extraction when the raw response contains
 * surrounding prose or markdown fences that break `JSON.parse`.
 *
 * @param {string} raw - Raw text returned by the LLM.
 * @returns {Array<{file: string, summary: string}>} Parsed summaries, or
 *   an empty array if parsing fails entirely.
 * @private
 */
function _parseResponse(raw) {
  // 1. Direct parse
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // fall through to regex fallback
  }

  // 2. Try to locate a JSON array inside the response (e.g. wrapped in
  //    markdown code fences or preceded/followed by prose).
  try {
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch {
    // fall through
  }

  return [];
}

// ─── Main Orchestrator ───────────────────────────────────────────────────────

/**
 * End-to-end selective summarization pipeline.
 *
 * 1. Scores every file and picks the top-N most important ones.
 * 2. Groups them into batches with truncated content.
 * 3. Builds a prompt per batch and delegates to the injected `generateFn`.
 * 4. Parses each response (with regex fallback) and concatenates results.
 *
 * @param {Array<Object>} metadataList - File-metadata objects from the
 *   metadata extractor (must contain `filePath`).
 * @param {Object} fileContentsMap - Plain object mapping `filePath → content`.
 * @param {(prompt: string) => Promise<string>} generateFn - Provider-
 *   agnostic async LLM generation function.
 * @param {(meta: Object) => number} scoreFn - Importance scoring function.
 * @param {Object}  [options]                          - Pipeline options.
 * @param {number}  [options.budget=50]                - Max files to summarize.
 * @param {number}  [options.batchSize=5]              - Files per LLM call.
 * @param {number}  [options.maxContentLength=1500]    - Char limit per file.
 * @returns {Promise<Array<{file: string, summary: string}>>} Aggregated
 *   summaries for every file that was successfully summarized.
 */
async function summarizeFiles(
  metadataList,
  fileContentsMap,
  generateFn,
  scoreFn,
  options = {},
) {
  const { budget, batchSize, maxContentLength } = options;

  // ── Step 1: Select ──────────────────────────────────────────────────────
  const selectedFiles = selectFilesToSummarize(metadataList, scoreFn, {
    budget,
  });

  if (selectedFiles.length === 0) {
    return [];
  }

  // ── Step 2: Batch ───────────────────────────────────────────────────────
  const batches = createSummarizationBatches(selectedFiles, fileContentsMap, {
    batchSize,
    maxContentLength,
  });

  // ── Step 3 & 4: Generate + Parse ────────────────────────────────────────
  /** @type {Array<{file: string, summary: string}>} */
  const allSummaries = [];

  for (const batch of batches) {
    const prompt = buildBatchPrompt(batch);

    try {
      const rawResponse = await generateFn(prompt);
      const parsed = _parseResponse(rawResponse);
      allSummaries.push(...parsed);
    } catch (err) {
      // Log but don't throw — partial results are better than none.
      console.error(
        `[selectiveSummarizer] Batch failed (${batch.length} files):`,
        err.message || err,
      );
    }
  }

  return allSummaries;
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  selectFilesToSummarize,
  createSummarizationBatches,
  buildBatchPrompt,
  summarizeFiles,
};
