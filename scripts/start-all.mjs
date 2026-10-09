// Production: runs the web server and the background worker together, restarting the worker if it crashes.
import { spawn } from "node:child_process";

const run = (name, args) => {
  const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", args, { stdio: "inherit", shell: process.platform === "win32" });
  child.on("exit", (code) => {
    console.error(`[${name}] exited with ${code}`);
    if (name === "web") process.exit(code ?? 1);
    setTimeout(() => run(name, args), 5000);
  });
  return child;
};

run("web", ["run", "start"]);
run("worker", ["run", "worker"]);
