const Project = require("../models/projects");
const { buildFolderStructure } = require("../utils/helper");
const { getGithubRepoInfo, getOctokit,client } = require("../utils/helper");
const { Document } = require("@langchain/core/documents");
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
const { extractAllMetadata, scoreFileImportance } = require('../rag/metadataExtractor');
const { generateAllFolderSignatures, generateFileTree } = require('../rag/folderSignatures');
const { summarizeFiles } = require('../rag/selectiveSummarizer');
const { generateProjectOverview } = require('../rag/projectOverview');
const { createAllChunks } = require('../rag/chunker');
const { storeChunks } = require('../rag/embedder');
const {groq,generateFn} =require('../utils/helper');


const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
});



async function createProject(projectData) {
  const { name, description, userId } = projectData;
  try {
    const newProject = new Project({
      name,
      description,
      user: userId,
    });
    return await newProject.save();
  } catch (err) {
    throw new Error("Error creating project: " + err.message);
  }
}

async function analyzeProject(githubUrl) {
  try {
    const requiredData = await getGithubRepoInfo(githubUrl);
    const owner = githubUrl.split("/")[3];
    const repo = githubUrl.split("/")[4];
    const octokit = await getOctokit();

    const tree = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: requiredData.branch,
      recursive: "true",
    });

    const topFolders = buildFolderStructure(tree.data.tree);

    return topFolders;
  } catch (err) {
    if (err.response?.data.status == 404) {
      throw "The specified repository was not found or it was private. Please check the URL and try again.";
    }
    throw "Error analyzing project: " + err.message;
  }
}

async function getProjectById(projectId, userId) {
  try {
    const project = await Project.findById(projectId).populate(
      "user",
      "name email",
    );

    if (!project) {
      throw "Project not found";
    }

    if (project.user.id.toString() != userId) {
      throw "You are not the owner of this project";
    }

    return project;
  } catch (err) {
    throw "Error fetching project by ID: " + err.message;
  }
}


async function chunkAndCreateEmbeddings(projectId, files) {
  try {
    // Step 1: Extract metadata (zero LLM cost)
    console.log(`[Pipeline] Extracting metadata from ${files.length} files...`);
    const metadataList = extractAllMetadata(files);

    // Step 2: Folder signatures (zero LLM cost)
    console.log(`[Pipeline] Generating folder signatures...`);
    const folderSignatures = generateAllFolderSignatures(metadataList);

    // Step 3: File tree
    const fileTree = generateFileTree(files);

    // Step 4: Build contents map
    const fileContentsMap = {};
    for (const file of files) {
      fileContentsMap[file.path] = file.content;
    }

    // Step 5: Summarize top files (budget-controlled LLM)
    console.log(`[Pipeline] Summarizing important files...`);
    const fileSummaries = await summarizeFiles(
      metadataList, fileContentsMap, generateFn, scoreFileImportance,
      { budget: 50, batchSize: 5 }
    );

    // Step 6: Project overview (1 LLM call)
    console.log(`[Pipeline] Generating project overview...`);
    const overview = await generateProjectOverview(
      folderSignatures, fileSummaries, fileTree, generateFn
    );

    // Step 7: Create all chunks (code + summaries + overview)
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

    // Step 8: Store in ChromaDB
    console.log(`[Pipeline] Storing in ChromaDB...`);
    const result = await storeChunks(client, projectId, allChunks);
    console.log(`[Pipeline] Done! Stored ${result.totalStored} chunks`);

  } catch (err) {
    console.log(err);
  }
}






module.exports = {
  createProject,
  analyzeProject,
  getProjectById,
  chunkAndCreateEmbeddings,
};
