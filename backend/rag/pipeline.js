/**
 * @module pipeline
 * @description Main orchestrator for the RAG ingestion pipeline. Ties together metadata
 * extraction, folder signatures, selective summarization, project overview generation,
 * chunking, and ChromaDB storage into a single coherent flow.
 */

const { extractAllMetadata, scoreFileImportance } = require('./metadataExtractor');
const { generateAllFolderSignatures, generateFileTree } = require('./folderSignatures');
const { summarizeFiles } = require('./selectiveSummarizer');
const { generateProjectOverview } = require('./projectOverview');
const { createAllChunks } = require('./chunker');
const { storeChunks } = require('./embedder');

/**
 * Main pipeline function that orchestrates the entire RAG ingestion process.
 * Replaces the original `chunkAndCreateEmbeddings` with an enriched, multi-step flow.
 *
 * @async
 * @param {string} projectId - ChromaDB collection name.
 * @param {Array<{path: string, content: string}>} files - File objects fetched from GitHub.
 * @param {object} options - Pipeline configuration options.
 * @param {object} options.client - ChromaDB client instance.
 * @param {object} options.splitter - LangChain text splitter instance.
 * @param {function(string): Promise<string>} options.generateFn - LLM generation function
 *   that accepts a prompt string and returns the generated text.
 * @param {number} [options.budget=50] - Maximum number of files to summarize with the LLM.
 * @param {number} [options.batchSize=5] - Number of files per LLM summarization call.
 * @returns {Promise<{collectionName: string, totalStored: number, breakdown: object}>}
 *   Result object containing storage details and a per-type chunk breakdown.
 * @throws {Error} If any pipeline step fails.
 */
async function chunkAndCreateEmbeddings(projectId, files, { client, splitter, generateFn, budget = 50, batchSize = 5 }) {
  try {
    // ── Step 1: Extract metadata from all files ──────────────────────────
    console.log(`[Pipeline] Extracting metadata from ${files.length} files...`);
    const metadataList = extractAllMetadata(files);

    // ── Step 2: Generate folder signatures ───────────────────────────────
    console.log(`[Pipeline] Generating folder signatures...`);
    const folderSignatures = generateAllFolderSignatures(metadataList);
    console.log(`[Pipeline] Generated ${folderSignatures.length} folder signatures`);

    // ── Step 3: Generate file tree ───────────────────────────────────────
    const fileTree = generateFileTree(files);

    // ── Step 4: Build file contents map ──────────────────────────────────
    const fileContentsMap = {};
    for (const file of files) {
      fileContentsMap[file.path] = file.content;
    }

    // ── Step 5: Selective file summarization (LLM) ───────────────────────
    console.log(`[Pipeline] Summarizing top files (budget: ${budget})...`);
    const fileSummaries = await summarizeFiles(metadataList, fileContentsMap, generateFn, scoreFileImportance, { budget, batchSize });
    console.log(`[Pipeline] Generated ${fileSummaries.length} file summaries`);

    // ── Step 6: Generate project overview (LLM) ──────────────────────────
    console.log(`[Pipeline] Generating project overview...`);
    const overview = await generateProjectOverview(folderSignatures, fileSummaries, fileTree, generateFn);

    // ── Step 7: Create all chunks ────────────────────────────────────────
    console.log(`[Pipeline] Creating chunks...`);
    const allChunks = await createAllChunks({
      files,
      projectId,
      splitter,
      folderSignatures,
      fileSummaries,
      projectOverview: overview,
    });
    console.log(`[Pipeline] Total chunks: ${allChunks.length}`);

    // Log per-type breakdown
    const breakdown = allChunks.reduce((acc, c) => {
      acc[c.type] = (acc[c.type] || 0) + 1;
      return acc;
    }, {});
    console.log(`[Pipeline] Chunk breakdown:`, breakdown);

    // ── Step 8: Store in ChromaDB ────────────────────────────────────────
    console.log(`[Pipeline] Storing in ChromaDB...`);
    const result = await storeChunks(client, projectId, allChunks);
    console.log(`[Pipeline] Done! Stored ${result.totalStored} chunks in collection '${result.collectionName}'`);

    return { ...result, breakdown };
  } catch (error) {
    console.error(`[Pipeline] Error during pipeline execution for project '${projectId}':`, error);
    throw error;
  }
}

module.exports = { chunkAndCreateEmbeddings };

/*
 * USAGE EXAMPLE:
 * 
 * const { ChromaClient } = require('chromadb');
 * const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
 * const { OpenAI } = require('openai');
 * 
 * const client = new ChromaClient();
 * const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1500, chunkOverlap: 200 });
 * const openai = new OpenAI();
 * 
 * const generateFn = async (prompt) => {
 *   const res = await openai.chat.completions.create({
 *     model: 'gpt-4o-mini',  // Use a cheap model for summarization
 *     messages: [{ role: 'user', content: prompt }],
 *   });
 *   return res.choices[0].message.content;
 * };
 * 
 * // files from GitHub
 * const files = [{ path: 'src/index.js', content: '...' }, ...];
 * 
 * await chunkAndCreateEmbeddings('my-project', files, {
 *   client,
 *   splitter,
 *   generateFn,
 *   budget: 50,
 * });
 */
