const STATUS_CODE={
NOT_FOUND:404,
SUCCESS:200,
SERVER_ERROR:500,
UNAUTHORIZED:401,
CONFLICT:409,
}

const IGNORED_FOLDERS = new Set([
  "node_modules",
  ".git",
  ".github",
  "dist",
  "build",
  "coverage",
  ".next",
  ".vscode",
  ".idea",
  "__pycache__"
]);

const SUPPORTED_EXTENSIONS = new Set([
    ".js",
    ".ts",
    ".tsx",
    ".jsx",
    ".py",
    ".java",
    ".go",
    ".rs",
    ".cpp",
    ".c",
    ".cs",
    ".php",
    ".rb",
    ".md",
    ".txt",
    ".json",
    ".yaml",
    ".yml"
]);

const IGNORED_FILES = new Set([
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "Cargo.lock",
    "composer.lock",
]);



module.exports={
    STATUS_CODE,
    IGNORED_FOLDERS,
    SUPPORTED_EXTENSIONS,
    IGNORED_FILES,
}