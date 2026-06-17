require('dotenv').config();
const { Worker }     = require('bullmq');
const { connection } = require('./queue');

const worker = new Worker('worker-queue', async job => {
  const { project } = job.data;
  console.log(`Processing job with ID ${job.id} for project:`, project);
}, { connection });

worker.on('completed', (job) => {
  console.log(`Job with ID ${job.id} has completed.`);
});