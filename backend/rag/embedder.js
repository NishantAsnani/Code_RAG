/**
 * @module embedder
 *
 * Handles storing unified chunks in ChromaDB and querying them back
 * with optional chunk-type filtering. The ChromaDB client is always
 * injected — this module never instantiates one itself.
 */

const crypto = require('crypto');

/**
 * Converts an array of unified chunks into the three parallel arrays
 * that ChromaDB's `collection.add()` expects.
 *
 * @param {Array<{ text: string, type: string, metadata: object }>} chunks
 *   Each chunk must carry at least `text`, `type`, and a `metadata` object.
 * @returns {{ ids: string[], documents: string[], metadatas: object[] }}
 *   Three parallel arrays ready for ChromaDB ingestion.
 * @throws {Error} If `chunks` is not a non-empty array.
 */
function prepareForChroma(chunks) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    throw new Error('prepareForChroma expects a non-empty array of chunks');
  }

  const ids = [];
  const documents = [];
  const metadatas = [];

  for (const chunk of chunks) {
    ids.push(crypto.randomUUID());
    documents.push(chunk.text);
    metadatas.push({
      ...chunk.metadata,
      chunkType: chunk.type,
    });
  }

  return { ids, documents, metadatas };
}

/**
 * Stores an array of unified chunks in a ChromaDB collection, batching
 * the inserts to stay within ChromaDB's practical limits.
 *
 * If a single batch fails, the error is logged and the remaining batches
 * are still attempted — the pipeline is not aborted.
 *
 * @param {object} client
 *   An already-initialised ChromaDB client instance.
 * @param {string} projectId
 *   Used as the ChromaDB collection name.
 * @param {Array<{ text: string, type: string, metadata: object }>} chunks
 *   The unified chunks to store.
 * @param {object} [options]
 * @param {number} [options.batchSize=100]
 *   Maximum number of chunks sent in a single `collection.add()` call.
 * @returns {Promise<{ totalStored: number, collectionName: string }>}
 *   A summary of how many chunks were persisted and under which collection.
 */
async function storeChunks(client, projectId, chunks, { batchSize = 100 } = {}) {
  const collection = await client.getOrCreateCollection({ name: projectId });
  const { ids, documents, metadatas } = prepareForChroma(chunks);

  let totalStored = 0;

  for (let i = 0; i < ids.length; i += batchSize) {
    const batchIds = ids.slice(i, i + batchSize);
    const batchDocuments = documents.slice(i, i + batchSize);
    const batchMetadatas = metadatas.slice(i, i + batchSize);

    try {
      await collection.add({
        ids: batchIds,
        documents: batchDocuments,
        metadatas: batchMetadatas,
      });

      totalStored += batchIds.length;
    } catch (err) {
       console.error(err);
  console.error(err.stack);
  console.error(err.cause);
      // console.error(
      //   `[embedder] Failed to store batch ${Math.floor(i / batchSize) + 1} ` +
      //     `(chunks ${i}–${i + batchIds.length - 1}): ${err.message}`
      // );
    }
  }

  return { totalStored, collectionName: projectId };
}

/**
 * Queries a ChromaDB collection, optionally restricting results to
 * specific chunk types via a `$in` where-filter on `chunkType`.
 *
 * @param {object} collection
 *   A ChromaDB collection object (already retrieved from the client).
 * @param {string} queryText
 *   The natural-language query string.
 * @param {object} [options]
 * @param {number} [options.nResults=10]
 *   Maximum number of results to return.
 * @param {string[]|null} [options.chunkTypes=null]
 *   If provided, only chunks whose `chunkType` metadata value is in this
 *   array will be considered (e.g. `['project_overview', 'folder_summary']`).
 * @returns {Promise<object>}
 *   The raw query results from ChromaDB.
 */
async function queryWithFilter(collection, queryText, { nResults = 10, chunkTypes = null } = {}) {
  const queryParams = {
    queryTexts: [queryText],
    nResults,
  };

  if (Array.isArray(chunkTypes) && chunkTypes.length > 0) {
    queryParams.where = { chunkType: { $in: chunkTypes } };
  }

  return collection.query(queryParams);
}

module.exports = {
  prepareForChroma,
  storeChunks,
  queryWithFilter,
};
