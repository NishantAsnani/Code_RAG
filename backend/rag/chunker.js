/**
 * @module chunker
 * @description
 * Handles the creation of all embeddable chunks for the RAG pipeline.
 * Takes raw code files, metadata, folder signatures, file summaries, and a
 * project overview — and produces a unified array of chunks ready for embedding.
 *
 * Uses LangChain's Document class for document representation before splitting.
 */

// NOTE: For newer LangChain versions, use `require('@langchain/core/documents')` instead.
const { Document } = require('@langchain/core/documents');

/**
 * @typedef {Object} RawFile
 * @property {string} path    - Relative or absolute path to the source file.
 * @property {string} content - Full text content of the file.
 */

/**
 * @typedef {Object} FolderSignature
 * @property {string} folder    - Folder path.
 * @property {string} text      - Descriptive signature text for the folder.
 * @property {number} fileCount - Number of files contained in the folder.
 */

/**
 * @typedef {Object} FileSummary
 * @property {string} file    - File path the summary belongs to.
 * @property {string} summary - Short summary of the file's purpose / contents.
 */

/**
 * @typedef {Object} Chunk
 * @property {string} text     - The embeddable text payload.
 * @property {string} type     - Chunk type identifier (e.g. 'code_chunk', 'folder_summary').
 * @property {Object} metadata - Contextual metadata attached to the chunk.
 */

/**
 * Creates code chunks by wrapping each raw file in a LangChain Document,
 * splitting with the provided text splitter, and normalising the output.
 *
 * @param {RawFile[]} files        - Array of `{ path, content }` source files.
 * @param {string}    projectId    - Unique identifier for the current project.
 * @param {import('langchain/text_splitter').RecursiveCharacterTextSplitter} splitter
 *   A LangChain text splitter instance used to split documents into smaller chunks.
 * @returns {Promise<Chunk[]>} Array of code chunks ready for embedding.
 */
async function createCodeChunks(files, projectId, splitter) {
  if (!Array.isArray(files) || files.length === 0) {
    return [];
  }

  const docs = files.map(
    (file) =>
      new Document({
        pageContent: `FILE: ${file.path}\n${file.content}`,
        metadata: { projectId, filePath: file.path },
      })
  );

  const splitDocs = await splitter.splitDocuments(docs);

  return splitDocs.map((doc) => ({
    text: doc.pageContent,
    type: 'code_chunk',
    metadata: {
      projectId,
      filePath: doc.metadata.filePath,
    },
  }));
}

/**
 * Creates folder-level summary chunks from pre-computed folder signatures.
 *
 * @param {FolderSignature[]} folderSignatures - Array of folder signature objects.
 * @param {string}            projectId        - Unique identifier for the current project.
 * @returns {Chunk[]} Array of folder summary chunks.
 */
function createFolderChunks(folderSignatures, projectId) {
  if (!Array.isArray(folderSignatures) || folderSignatures.length === 0) {
    return [];
  }

  return folderSignatures.map((sig) => ({
    text: sig.text,
    type: 'folder_summary',
    metadata: {
      projectId,
      folder: sig.folder,
    },
  }));
}

/**
 * Creates file-level summary chunks from pre-computed file summaries.
 *
 * @param {FileSummary[]} fileSummaries - Array of `{ file, summary }` objects.
 * @param {string}        projectId    - Unique identifier for the current project.
 * @returns {Chunk[]} Array of file summary chunks.
 */
function createSummaryChunks(fileSummaries, projectId) {
  if (!Array.isArray(fileSummaries) || fileSummaries.length === 0) {
    return [];
  }

  return fileSummaries.map((s) => ({
    text: `File Summary — ${s.file}: ${s.summary}`,
    type: 'file_summary',
    metadata: {
      projectId,
      filePath: s.file,
    },
  }));
}

/**
 * Wraps the project-level overview text in a single-element chunk array.
 *
 * @param {string} overviewText - Full project overview / description.
 * @param {string} projectId   - Unique identifier for the current project.
 * @returns {Chunk[]} Single-element array containing the overview chunk.
 */
function createOverviewChunk(overviewText, projectId) {
  if (!overviewText) {
    return [];
  }

  return [
    {
      text: overviewText,
      type: 'project_overview',
      metadata: { projectId },
    },
  ];
}

/**
 * Orchestrates all chunk creation by calling every specialised creator and
 * concatenating the results into one flat array.
 *
 * @param {Object} params
 * @param {RawFile[]}          params.files            - Source code files.
 * @param {string}             params.projectId        - Project identifier.
 * @param {import('langchain/text_splitter').RecursiveCharacterTextSplitter} params.splitter
 *   LangChain text splitter instance.
 * @param {FolderSignature[]}  params.folderSignatures - Folder signature objects.
 * @param {FileSummary[]}      params.fileSummaries    - File summary objects.
 * @param {string}             params.projectOverview  - Project overview text.
 * @returns {Promise<Chunk[]>} Unified array of all embeddable chunks.
 */
async function createAllChunks({
  files,
  projectId,
  splitter,
  folderSignatures,
  fileSummaries,
  projectOverview,
}) {
  const codeChunks = await createCodeChunks(files, projectId, splitter);
  const folderChunks = createFolderChunks(folderSignatures, projectId);
  const summaryChunks = createSummaryChunks(fileSummaries, projectId);
  const overviewChunks = createOverviewChunk(projectOverview, projectId);

  return [
    ...codeChunks,
    ...folderChunks,
    ...summaryChunks,
    ...overviewChunks,
  ];
}

module.exports = {
  createCodeChunks,
  createFolderChunks,
  createSummaryChunks,
  createOverviewChunk,
  createAllChunks,
};
