require('dotenv').config();
const { Worker }     = require('bullmq');
const { connection } = require('./queue');
const {getOctokit} = require('../services/project.service');



console.log('Worker is running and waiting for jobs...');
const worker = new Worker('worker-queue', async job => {
  const { project } = job.data;
  console.log(`Processing job with ID ${job.id} for project:`, project.name);

  const octokit = await getOctokit();
  const owner= project.githubLink.split('/')[3];
  const repo= project.githubLink.split('/')[4];

  const path = project.indexedPaths[0].value === "/"? "": project.indexedPaths[0].value;
  const getRequiredFiles=await octokit.repos.getContent({
    owner,
    repo,
    path
  });

  console.log(`Fetched required files for project ${project.name}:`, getRequiredFiles.data);
}, { connection });

worker.on('completed', (job) => {
  console.log(`Job with ID ${job.id} has completed.`);
});