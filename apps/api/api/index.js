// Vercel Zero Config Entrypoint
// We dynamically import the compiled NestJS entrypoint from dist/
// This ensures Vercel's Node File Trace only scans compiled JavaScript, avoiding .tsx transpilation bugs.
export default async function (req, res) {
  const handler = await import('../dist/api.js');
  return handler.default(req, res);
}
