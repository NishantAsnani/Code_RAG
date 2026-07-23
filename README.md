# CodeWiki

CodeWiki is a full-stack, RAG-based repository analysis assistant. It lets authenticated users create projects, analyze GitHub repositories, index selected repository paths, and ask questions about the indexed codebase using a retrieval-augmented generation pipeline.

## Features

- User signup, login, and JWT-based authentication
- Project creation and paginated project listing
- GitHub repository analysis and selectable indexing paths
- Background repository indexing through BullMQ and Redis
- Code metadata extraction, folder signatures, selective file summaries, and project overviews
- ChromaDB vector storage for indexed repository content
- Groq-powered answers based on retrieved repository context
- Next.js frontend with Redux Toolkit state management

## Technology Stack

- **Frontend:** Next.js 16, React 19, Redux Toolkit, Axios, Tailwind CSS 4
- **Backend:** Node.js, Express 5, Mongoose, Joi, JWT, bcrypt
- **RAG:** LangChain text splitters, Hugging Face Transformers, ChromaDB, Groq SDK
- **Background processing:** BullMQ and Redis
- **Repository source:** GitHub API through Octokit
- **Database:** MongoDB

The frontend is currently under active development and is not yet complete.

## Prerequisites

Install or run the following services locally:

- Node.js 18.18 or newer
- npm
- MongoDB
- Docker Desktop, for running Redis and ChromaDB
- A Groq API key
- A GitHub token with access to the repositories that will be analyzed

The backend expects ChromaDB at `http://localhost:8000`. The default Redis connection is `127.0.0.1:6379`.

## Installation

Clone the repository and install dependencies in both applications:

```powershell
cd backend
npm install

cd frontend
npm install
```

## Environment Configuration

Create `backend/.env` from `backend/.sample.env` and provide the required values:

```dotenv
GROQ_API_KEY=your_groq_api_key
DB_NAME=code_rag
DB_URL=mongodb://127.0.0.1:27017/code_rag
PORT=3001
jwtSecret=replace_with_a_long_random_secret
GITHUB_TOKEN=your_github_token
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

`DB_URL`, `REDIS_HOST`, and `REDIS_PORT` are supported by the backend even though they are not currently listed in the sample environment file. If `PORT` is omitted, the API defaults to port `3000`.

The frontend uses the API URL below by default:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

To use a different backend URL, create `frontend/.env.local` with the variable above.

## Start Redis and ChromaDB with Docker

Run these commands from the repository root. Docker manages the ChromaDB data in a named volume so it persists when the container is recreated.

```powershell
docker run -d --name codewiki-redis -p 6379:6379 redis:7
docker volume create codewiki-chroma-data
docker run -d --name codewiki-chroma -p 8000:8000 -v codewiki-chroma-data:/chroma/chroma chromadb/chroma
```

Check that both containers are running:

```powershell
docker ps
```

To stop and remove the containers later:

```powershell
docker stop codewiki-redis codewiki-chroma
docker rm codewiki-redis codewiki-chroma
```

## Running Locally

Start MongoDB, then start the Redis and ChromaDB Docker containers described above. ChromaDB should be reachable at `http://localhost:8000` and Redis at `127.0.0.1:6379`.

Run the backend API in one terminal:

```powershell
cd backend
npm start
```

Run the background indexing worker in a second terminal:

```powershell
cd backend
npm run worker
```

Run the frontend in a third terminal:

```powershell
cd frontend
npm run dev
```

Open the frontend at [http://localhost:3000](http://localhost:3000). The API is available at [http://localhost:3001/api](http://localhost:3001/api) when `PORT=3001` is configured.

For a production frontend build:

```powershell
cd frontend
npm run build
npm start
```

The backend `start` script uses `nodemon`, so it automatically restarts during development. The worker must remain running while indexing jobs are being processed.

## RAG Workflow

1. A user signs up or logs in and receives a JWT.
2. The user creates a project.
3. The backend analyzes the GitHub repository and returns available scopes or paths.
4. The user starts indexing a selected path.
5. The API adds an indexing job to the BullMQ queue.
6. The worker fetches repository files from GitHub.
7. The RAG pipeline extracts metadata, generates folder signatures and summaries, creates chunks, and stores them in a ChromaDB collection named for the project.
8. The user asks a question about the project.
9. Relevant chunks are retrieved and sent to Groq to generate an answer grounded in the repository context.

## API Information

All API information is available in [backend/postman/CodeWiki.postman_collection.json](backend/postman/CodeWiki.postman_collection.json).

## Development Notes

- The frontend's default API URL uses port `3001`, so configure the backend `PORT=3001` for the default local setup.
- Indexing is asynchronous. A successful indexing request only queues the work; monitor the worker terminal for completion or errors.
- The repository must be accessible with the configured GitHub token.
- ChromaDB must be running before indexing or asking questions about a project.
- `backend/data/sample.pdf` is referenced by the unauthenticated `/api/chat/test` endpoint. Add that file if you intend to use the test endpoint.
- The backend currently has no automated test suite. `npm test` is a placeholder command.

## Useful Commands

```powershell
# Backend
cd backend
npm start       # API with nodemon
npm run worker  # BullMQ indexing worker
npm test        # Placeholder; currently exits with an error

# Frontend
cd frontend
npm run dev     # Development server
npm run lint    # ESLint
npm run build   # Production build
npm start       # Production server
```
