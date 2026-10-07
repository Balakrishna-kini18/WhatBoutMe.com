const fs = require('fs');
const path = require('path');

// 1. Gather all API controllers and their base paths
function getFiles(dir, match) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    if (file === 'node_modules' || file === '.next' || file === 'dist') return;
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFiles(file, match));
    } else if (file.match(match)) {
      results.push(file);
    }
  });
  return results;
}

const apiDir = path.join(__dirname, 'apps', 'api', 'src', 'modules');
const controllerFiles = getFiles(apiDir, /\.controller\.ts$/);

const endpoints = [];

controllerFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  let basePath = '';
  const controllerMatch = content.match(/@Controller\(['"]([^'"]+)['"]\)/);
  if (controllerMatch) {
    basePath = controllerMatch[1];
  }

  const methodRegex = /@(Get|Post|Patch|Put|Delete)\((['"]([^'"]*)['"])?\)/g;
  let match;
  while ((match = methodRegex.exec(content)) !== null) {
    const httpMethod = match[1].toUpperCase();
    let subPath = match[3] || '';
    
    // Normalize path
    let fullPath = `/${basePath}${subPath ? '/' + subPath : ''}`.replace(/\/+/g, '/').replace(/\/$/, '');
    if (fullPath === '') fullPath = '/';

    // To search the frontend, we simplify the path by removing params like /:id
    const searchPattern = fullPath.replace(/\/:[^/]+/g, '');
    
    endpoints.push({
      method: httpMethod,
      fullPath,
      searchPattern,
      file: path.relative(apiDir, file)
    });
  }
});

// 2. Search Frontend files
const frontendDirs = [
  path.join(__dirname, 'apps', 'admin'),
  path.join(__dirname, 'apps', 'lms'),
  path.join(__dirname, 'apps', 'marketing')
];

let allFrontendFiles = [];
frontendDirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    allFrontendFiles = allFrontendFiles.concat(getFiles(dir, /\.(tsx|ts|jsx|js)$/));
  }
});

const unintegrated = [];

endpoints.forEach(ep => {
  let found = false;
  // some endpoints are very short like /users or /programs
  // we check if they appear in any frontend file
  for (const file of allFrontendFiles) {
    const content = fs.readFileSync(file, 'utf8');
    // search for the pattern, e.g., /programs or /auth/login
    // we use a simple text match for the route
    if (content.includes(`"${ep.searchPattern}"`) || 
        content.includes(`'${ep.searchPattern}'`) || 
        content.includes(`\`${ep.searchPattern}\``) ||
        content.includes(`${ep.searchPattern}/`) ||
        content.includes(`${ep.searchPattern}?`)) {
      found = true;
      break;
    }
  }

  if (!found) {
    unintegrated.push(ep);
  }
});

console.log(`Total Endpoints: ${endpoints.length}`);
console.log(`Unintegrated Endpoints: ${unintegrated.length}\n`);
console.log("List of unintegrated endpoints (Not found directly in frontend code):");
unintegrated.forEach(ep => {
  console.log(`${ep.method.padEnd(6)} ${ep.fullPath.padEnd(40)} (in ${ep.file})`);
});
