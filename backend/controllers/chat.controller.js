const { sendSuccessResponse, sendErrorResponse } = require("../utils/response");
const { STATUS_CODE } = require("../utils/constants");
const { PDFLoader } = require("@langchain/community/document_loaders/fs/pdf");
const path = require("path");
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
const { pipeline } = require("@huggingface/transformers");
const { ChromaClient } = require("chromadb");
const Groq = require("groq-sdk");
const Joi = require("joi");
const { client } = require('../utils/helper');
const { enhancedQuery } = require('../rag/queryHelper');

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

async function testEndpoint(req, res) {
  try {
    // STEP 1: Load PDF
    const loader = new PDFLoader(
      path.join(__dirname, "..", "data", "sample.pdf"),
    );

    const docs = await loader.load();

    // STEP 2: Chunk PDF
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const chunkedDocs = await splitter.splitDocuments(docs);

    // STEP 3: Load Embedding Model
    const extractor = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
    );

    // STEP 4: Generate Embeddings
    const vectors = [];

    // for (let i = 0; i < chunkedDocs.length; i++) {
    //   const chunk = chunkedDocs[i];

    //   const embedding = await extractor(chunk.pageContent, {
    //     pooling: "mean",
    //     normalize: true,
    //   });

    // //   console.log(`Chunk ${i + 1}/${chunkedDocs.length} embedded`,embedding);

    //   vectors.push({
    //     id: `chunk-${i}`,
    //     text: chunk.pageContent,
    //     embedding: embedding.tolist().flat(),
    //   });
    // }

    // console.log(vectors[0].embedding.slice(0,10));

    // STEP 5: Connect Chroma
    const client = new ChromaClient({
      path: "http://localhost:8000",
    });

    const collection = await client.getOrCreateCollection({
      name: "pdf-rag",
    });

    // Optional: clear previous data
    try {
      const existing = await collection.get();

      if (existing.ids.length > 0) {
        await collection.delete({
          ids: existing.ids,
        });
      }
    } catch (err) {
      console.log("Collection empty");
    }



    // STEP 6: Store in Chroma
    await collection.add({
      ids: chunkedDocs.map((_, i) => `chunk-${i}`),
      documents: chunkedDocs.map(doc => doc.pageContent),
    });

    // STEP 7: Hardcoded Question
    const question = "What is GitHub?";

    // STEP 8: Generate Question Embedding
    const queryEmbedding = await extractor(question, {
      pooling: "mean",
      normalize: true,
    });

    const queryVector = queryEmbedding.tolist().flat();

    // STEP 9: Retrieve Relevant Chunks
    const results = await collection.query({
      queryEmbeddings: [queryVector],
      nResults: 3,
    });

    const retrievedChunks = results.documents[0];

    const context = retrievedChunks.join("\n\n");

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant. Answer only from the provided context. If the answer is not present, say you don't know.",
        },
        {
          role: "user",
          content: `
Context:
${context}

Question:
${question}
`,
        },
      ],
      temperature: 0,
    });

    const answer = completion.choices[0].message.content;

    return sendSuccessResponse(
      res,
      {
        question,
        retrievedChunks,
        answer,
      },
      "RAG executed successfully",
      STATUS_CODE.SUCCESS,
    );
  } catch (err) {
    console.log(err);

    return sendErrorResponse(
      res,
      err.message,
      "Error executing RAG pipeline",
      STATUS_CODE.SERVER_ERROR,
    );
  }
}

// Import the enhanced query helper


// Same generateFn you already have (or import from a shared file)
async function generateFn(prompt) {
  const res = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
  });
  return res.choices[0].message.content;
}

async function askQuestion(req, res) {
  const projectSchema = Joi.object({
    projectId: Joi.string().required(),
    questionText: Joi.string().required()
  });

  const { error, value } = projectSchema.validate(req.body);
  if (error) {
    return sendErrorResponse(
      res,
      error?.message,
      "Validation error",
      STATUS_CODE.BAD_REQUEST,
    );
  }

  try {
    const { projectId, questionText } = value;

    const collection = await client.getCollection({
      name: projectId
    });



    // ✅ NEW: enhanced query with HyDE + classification + smart routing
    const { results } = await enhancedQuery(
      questionText,
      collection,
      generateFn,
      { nResults: 10 }
    );

    const context = results.documents[0].join("\n\n");

    const answer = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `You are an expert software engineer and repository analysis assistant.

You are provided with code snippets, file contents, and documentation retrieved from a GitHub repository.

Your job is to answer questions about the repository using ONLY the provided context.

Guidelines:

1. Carefully analyze the provided context before answering.

2. When asked about project purpose, architecture, technologies, workflows, or implementation details, infer the answer from the available code and documentation when reasonable.

3. Mention relevant file paths whenever useful.

4. Do not invent functionality that is not supported by the context.

5. If the answer is partially available, explain what can be determined and clearly mention any uncertainty.

6. Only respond with "I don't know based on the provided repository context" when the retrieved context genuinely lacks sufficient information.

7. Treat README files, configuration files, package files, routes, services, controllers, and source code as valid sources of information.

8. The repository context below is the only source of truth.

Repository Context:
${context}`
        },
        {
          role: "user",
          content: questionText   // ← just the question, context is already in system prompt
        }
      ]
    });

    

    return sendSuccessResponse(
      res,
      answer,
      "Answer for your query",
      STATUS_CODE.SUCCESS
    );
  } catch (err) {
    return sendErrorResponse(
      res,
      err.message,
      "Error answering question",
      STATUS_CODE.SERVER_ERROR,
    );
  }
}



module.exports = {
  testEndpoint,
  askQuestion
};
