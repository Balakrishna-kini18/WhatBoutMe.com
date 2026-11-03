import { spawn } from "node:child_process";

const child = spawn("next", ["dev", "--webpack", "--port", "3001"], {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --max-old-space-size=4096`.trim(),
  },
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
