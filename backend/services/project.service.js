const Project = require("../models/projects");
const {buildFolderStructure} = require("../utils/helper");

async function getOctokit() {
    const { Octokit } = await import("@octokit/rest");

    return new Octokit({
        auth: process.env.GITHUB_TOKEN,
    });
}

async function createProject(projectData) {
    const { name, description, userId } = projectData;
    try {
        
        const newProject = new Project({
            name,
            description,
            user:userId
        })
        return await newProject.save()
    } catch (err) {
        throw new Error("Error creating project: " + err.message);
    }
}

async function analyzeProject(githubUrl) {
    try {
        const octokit = await getOctokit();
        const owner= githubUrl.split('/')[3];
        const repo = githubUrl.split('/')[4];

        const { data: repoData } = await octokit.repos.get({
            owner,
            repo
        });

    

        const requiredData = {
            name: repoData.full_name,
            branch: repoData.default_branch,
            language: repoData.language,
            size: repoData.size,
        }

        const tree = await octokit.git.getTree({
            owner,
            repo,
            tree_sha:requiredData.branch,
            recursive: "true"
        });

        const topFolders=buildFolderStructure(tree.data.tree);

        return topFolders;

    } catch (err) {
        if(err.response?.data.status == 404) {
            throw ("The specified repository was not found or it was private. Please check the URL and try again.");
        }
        throw ("Error analyzing project: " + err.message);
    }
}

async function getProjectById(projectId, userId) {
    try{
        
        
        const project = await Project.findById(projectId).populate('user', 'name email');

        
        if (!project) {
            throw ("Project not found");
        }
        

        if (project.user.id.toString() != userId) {
            throw ("You are not the owner of this project");
        }

        return project;
    }catch(err){
        throw ("Error fetching project by ID: " + err.message);
    }
}


module.exports = {
    createProject,
    analyzeProject,
    getProjectById
}