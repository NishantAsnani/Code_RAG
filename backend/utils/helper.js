const { required } = require("joi");
const {
  IGNORED_FOLDERS,
  IGNORED_FILES,
  SUPPORTED_EXTENSIONS,
} = require("../utils/constants");
const pathModule = require("path");
const { Octokit } = require("@octokit/rest");
const { ChromaClient } = require("chromadb");
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function buildFolderStructure(tree) {
  const folders = new Map();
  let totalFiles = 0;

  tree.forEach((item) => {
    if (item.type !== "blob") return;

    totalFiles++;

    const parts = item.path.split("/");

    if (parts.length === 1) return;

    const topLevelFolder = parts[0];

    if (IGNORED_FOLDERS.has(topLevelFolder)) return;

    folders.set(topLevelFolder, (folders.get(topLevelFolder) || 0) + 1);
  });

  const scopes = [
    {
      name: "Entire Repository",
      value: "/",
      recommended: true,
      fileCount: totalFiles,
    },
  ];

  for (const [folder, fileCount] of folders.entries()) {
    scopes.push({
      name: folder,
      value: folder,
      recommended: false,
      fileCount,
    });
  }

  return {
    repositoryType:
      folders.size === 0
        ? "flat"
        : folders.size === 1
          ? "single_scope"
          : "multi_scope",

    canSelectScope: folders.size > 0,

    totalFiles,

    scopes,
  };
}

async function getGithubRepoInfo(githubUrl) {
  const octokit = await getOctokit();
  const owner = githubUrl.split("/")[3];
  const repo = githubUrl.split("/")[4];

  const { data: repoData } = await octokit.repos.get({
    owner,
    repo,
  });

  const requiredData = {
    name: repoData.full_name,
    branch: repoData.default_branch,
    language: repoData.language,
    size: repoData.size,
  };

  return requiredData;
}

async function fetchFilesFromGithub(path, githubUrl) {
  try {
    const octokit = await getOctokit();
    const owner = githubUrl.split("/")[3];
    const repo = githubUrl.split("/")[4];
    let files = [];

    const repoData = await getGithubRepoInfo(githubUrl);

    const tree = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: repoData.branch,
      recursive: "true",
    });

    if (path == "") {
      files = tree.data.tree.filter((item) => item.type == "blob");
    } else {
      files = tree.data.tree.filter(
        (item) => item.type === "blob" && item.path.startsWith(`${path}/`),
      );
    }

    files = files.filter((file) => {
      const pathParts = file.path.split("/");

      return !pathParts.some((folder) => IGNORED_FOLDERS.has(folder));
    });

    files = files.filter((file) => {
      const fileName = pathModule.basename(file.path);

      return !IGNORED_FILES.has(fileName);
    });

    files = files.filter((file) => {
      const extension = pathModule.extname(file.path).toLowerCase();

      return SUPPORTED_EXTENSIONS.has(extension);
    });


    

    const documents = await Promise.all(
      files.map(async (file) => {
        const response = await octokit.repos.getContent({
          owner,
          repo,
          path: file.path,
        });

        const content = Buffer.from(response.data.content, "base64").toString(
          "utf8",
        );

        return {
          path: file.path,
          content,
        };
      }),
    );

    return documents;
  } catch (err) {
    console.log(err);
  }
}

async function getOctokit() {
  const { Octokit } = await import("@octokit/rest");

  return new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });
}



async function generateFn(prompt) {
  const res = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
  });
  return res.choices[0].message.content;
}



const client = new ChromaClient({
  path: "http://localhost:8000",
});

module.exports = {
  buildFolderStructure,
  fetchFilesFromGithub,
  getGithubRepoInfo,
  getOctokit,
  client,
  generateFn,
  groq
};
