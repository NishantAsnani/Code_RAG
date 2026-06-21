require("dotenv").config();
const { Worker } = require("bullmq");
const { connection } = require("./queue");
const { fetchFilesFromGithub } = require("../utils/helper");
const {chunkAndCreateEmbeddings}=require('../services/project.service')

console.log("Worker is running and waiting for jobs...");
const worker = new Worker(
  "worker-queue",
  async (job) => {
    try {
      const { project } = job.data;
      console.log(
        `Processing job with ID ${job.id} for project:`,
        project.name,
      );

      const path =
        project.indexedPaths[0].value === "/"
          ? ""
          : project.indexedPaths[0].value;
          
      const requiredFiles = await fetchFilesFromGithub(
        path,
        project.githubLink,
      );
      const projectId=project._id;
      const chunkAndEmbbedFiles = await chunkAndCreateEmbeddings(projectId,requiredFiles);

      console.log("Repository Sucessfully Embedded");
    } catch (err) {
      console.log(err);
    }
  },
  { connection },
);

worker.on("completed", (job) => {
  console.log(`Job with ID ${job.id} has completed.`);
});
