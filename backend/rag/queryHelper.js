/**
 * @module queryHelper
 * @description Provides improved query-time retrieval strategies including
 * HyDE (Hypothetical Document Embeddings) and query routing/classification.
 */

'use strict';

/**
 * Valid query intent categories.
 * @readonly
 * @enum {string}
 */
const CATEGORIES = {
  OVERVIEW: 'OVERVIEW',
  SPECIFIC: 'SPECIFIC',
  HOW_TO: 'HOW_TO',
  DEBUG: 'DEBUG',
};

/**
 * Maps each query category to the chunk types that should be prioritised
 * during retrieval.
 * @readonly
 * @type {Object<string, string[]|null>}
 */
const CATEGORY_CHUNK_MAP = {
  [CATEGORIES.OVERVIEW]: ['project_overview', 'folder_summary', 'file_summary'],
  [CATEGORIES.SPECIFIC]: ['code_chunk', 'file_summary'],
  [CATEGORIES.HOW_TO]: ['file_summary', 'folder_summary', 'code_chunk'],
  [CATEGORIES.DEBUG]: ['code_chunk'],
};

/**
 * Classifies user query intent using an LLM.
 *
 * The function asks the LLM to assign the query to one of four categories:
 * `OVERVIEW`, `SPECIFIC`, `HOW_TO`, or `DEBUG`.  If the LLM returns an
 * unrecognised value the function defaults to `SPECIFIC`.
 *
 * @async
 * @param {string} query - The user's natural-language query.
 * @param {(prompt: string) => Promise<string>} generateFn - An async function
 *   that sends a prompt to an LLM and returns its text response.
 * @returns {Promise<string>} The resolved category string.
 */
async function classifyQuery(query, generateFn) {
  try {
    const prompt =
      'Classify the following user query into one of these categories:\n' +
      '- OVERVIEW — about the project purpose, architecture, tech stack, what it does\n' +
      '- SPECIFIC — about a specific function, class, file, or implementation detail\n' +
      '- HOW_TO — how something works, how to use something, flow/process questions\n' +
      '- DEBUG — about errors, bugs, issues, why something fails\n\n' +
      `Query: "${query}"\n\n` +
      'Return ONLY the category name, nothing else.';

    const raw = await generateFn(prompt);
    const category = raw.trim().toUpperCase();

    if (Object.values(CATEGORIES).includes(category)) {
      return category;
    }

    return CATEGORIES.SPECIFIC;
  } catch (error) {
    console.error('[queryHelper] classifyQuery failed:', error);
    return CATEGORIES.SPECIFIC;
  }
}

/**
 * Returns the array of chunk types to prioritise for a given query category.
 *
 * @param {string} category - One of the recognised category strings.
 * @returns {string[]|null} An array of chunk-type identifiers, or `null` if
 *   all chunk types should be searched.
 */
function getChunkTypesForCategory(category) {
  return CATEGORY_CHUNK_MAP[category] || null;
}

/**
 * Generates a hypothetical document embedding (HyDE) answer for a query.
 *
 * Instead of embedding the raw question, HyDE asks the LLM to produce a
 * plausible answer first.  The resulting text is then used as the embedding
 * query, which typically lands closer to relevant documents in vector space.
 *
 * @async
 * @param {string} query - The user's natural-language query.
 * @param {(prompt: string) => Promise<string>} generateFn - An async function
 *   that sends a prompt to an LLM and returns its text response.
 * @returns {Promise<string>} The hypothetical answer string.
 */
async function hydeRetrieval(query, generateFn) {
  try {
    const prompt =
      'You are a developer familiar with this codebase. Write a brief technical answer ' +
      '(3-4 sentences) to the following question. Even if you are unsure, write what a ' +
      'plausible answer would look like based on common software patterns.\n\n' +
      `Question: ${query}`;

    const hypotheticalAnswer = await generateFn(prompt);
    return hypotheticalAnswer;
  } catch (error) {
    console.error('[queryHelper] hydeRetrieval failed:', error);
    return query;
  }
}

/**
 * Performs an enhanced query against a ChromaDB collection, optionally using
 * HyDE and query classification to improve retrieval quality.
 *
 * The function executes two queries — a primary one (optionally powered by
 * HyDE and filtered by chunk type) and a secondary diversity query using the
 * original text — then merges and deduplicates the results.
 *
 * @async
 * @param {string} query - The user's natural-language query.
 * @param {object} collection - A ChromaDB collection instance exposing a
 *   `.query()` method.
 * @param {(prompt: string) => Promise<string>} generateFn - An async function
 *   that sends a prompt to an LLM and returns its text response.
 * @param {object} [options] - Optional configuration.
 * @param {number} [options.nResults=10] - Maximum number of results for the
 *   primary query.
 * @param {boolean} [options.useHyde=true] - Whether to use HyDE for the
 *   primary query.
 * @param {boolean} [options.useClassification=true] - Whether to classify the
 *   query and filter by chunk type.
 * @returns {Promise<{results: object, category: string|null, hydeAnswer: string|null}>}
 *   An object containing the merged ChromaDB results, the resolved category
 *   (if classification was used), and the HyDE answer (if HyDE was used).
 */
async function enhancedQuery(
  query,
  collection,
  generateFn,
  { nResults = 10, useHyde = true, useClassification = true } = {}
) {
  try {
    // ------------------------------------------------------------------
    // Step 1 – Classify the query
    // ------------------------------------------------------------------
    let category = null;
    if (useClassification) {
      category = await classifyQuery(query, generateFn);
    }

    // ------------------------------------------------------------------
    // Step 2 – Determine chunk-type filters from classification
    // ------------------------------------------------------------------
    const chunkTypes = category ? getChunkTypesForCategory(category) : null;

    // ------------------------------------------------------------------
    // Step 3 – Generate HyDE hypothetical answer
    // ------------------------------------------------------------------
    let hydeAnswer = null;
    if (useHyde) {
      hydeAnswer = await hydeRetrieval(query, generateFn);
    }

    // ------------------------------------------------------------------
    // Step 4 – Primary ChromaDB query
    // ------------------------------------------------------------------
    const primaryQueryText = hydeAnswer || query;

    const primaryQueryParams = {
      queryTexts: [primaryQueryText],
      nResults,
    };

    if (chunkTypes) {
      primaryQueryParams.where = { chunkType: { $in: chunkTypes } };
    }

    const primaryResults = await collection.query(primaryQueryParams);

    // ------------------------------------------------------------------
    // Step 5 – Secondary diversity query (original text, no type filter)
    // ------------------------------------------------------------------
    const diversityResults = await collection.query({
      queryTexts: [query],
      nResults: Math.floor(nResults / 2),
    });

    // ------------------------------------------------------------------
    // Step 6 – Merge and deduplicate by document ID
    // ------------------------------------------------------------------
    const results = mergeResults(primaryResults, diversityResults);

    return { results, category, hydeAnswer };
  } catch (error) {
    console.error('[queryHelper] enhancedQuery failed:', error);

    // Fall back to a plain query so the caller still gets something useful.
    try {
      const fallbackResults = await collection.query({
        queryTexts: [query],
        nResults,
      });
      return { results: fallbackResults, category: null, hydeAnswer: null };
    } catch (fallbackError) {
      console.error('[queryHelper] Fallback query also failed:', fallbackError);
      throw fallbackError;
    }
  }
}

/**
 * Merges two ChromaDB result sets and removes duplicate documents.
 *
 * Duplicates are identified by their document ID.  When the same ID appears
 * in both result sets the entry from the **primary** set is kept.
 *
 * @param {object} primary - The primary ChromaDB query result.
 * @param {object} secondary - The secondary (diversity) ChromaDB query result.
 * @returns {object} A merged result object with the same shape as a ChromaDB
 *   query response (`ids`, `documents`, `metadatas`, `distances`).
 */
function mergeResults(primary, secondary) {
  const seen = new Set();

  const merged = {
    ids: [[]],
    documents: [[]],
    metadatas: [[]],
    distances: [[]],
  };

  // Helper: iterate over one result set and append unseen entries.
  const addFromResultSet = (resultSet) => {
    if (!resultSet || !resultSet.ids || !resultSet.ids[0]) {
      return;
    }

    const ids = resultSet.ids[0];
    const documents = resultSet.documents ? resultSet.documents[0] : [];
    const metadatas = resultSet.metadatas ? resultSet.metadatas[0] : [];
    const distances = resultSet.distances ? resultSet.distances[0] : [];

    for (let i = 0; i < ids.length; i++) {
      const docId = ids[i];
      if (seen.has(docId)) {
        continue;
      }
      seen.add(docId);

      merged.ids[0].push(docId);
      merged.documents[0].push(documents[i] ?? null);
      merged.metadatas[0].push(metadatas[i] ?? null);
      merged.distances[0].push(distances[i] ?? null);
    }
  };

  addFromResultSet(primary);
  addFromResultSet(secondary);

  return merged;
}

module.exports = {
  classifyQuery,
  getChunkTypesForCategory,
  hydeRetrieval,
  enhancedQuery,
};
