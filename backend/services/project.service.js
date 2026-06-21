const Project = require("../models/projects");
const { buildFolderStructure } = require("../utils/helper");
const { getGithubRepoInfo, getOctokit,client } = require("../utils/helper");
const { Document } = require("@langchain/core/documents");
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");


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

async function chunkAndCreateEmbeddings(projectId,files) {
  try {
    const docs = files.map(
      (file, i) =>
        new Document({
          pageContent: `
        FILE: ${file.path}
          ${file.content}`,
          metadata: {
            filePath: file.path,
            projectId: projectId,
          },
        }),
    );

    const chunks = await splitter.splitDocuments(docs);

    const collection = await client.getOrCreateCollection({
      name: projectId,
    });

    const ids = [];
    const documents = [];
    const metadatas = [];

    for (const chunk of chunks) {
      ids.push(crypto.randomUUID());

      documents.push(chunk.pageContent);

      metadatas.push({
        projectId: chunk.metadata.projectId,
        filePath: chunk.metadata.filePath,
      });
    }

    const requiredCollection= await collection.add({
        ids,
        documents,
        metadatas
    });

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
