import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const localGo = join(homedir(), ".local", "go", "bin", "go");
const executable = existsSync(localGo) ? localGo : "go";
const child = spawn(executable, process.argv.slice(2), {
  cwd: new URL("../server-go", import.meta.url),
  stdio: "inherit",
  env: { ...process.env, PATH: `${join(homedir(), ".local", "go", "bin")}:${process.env.PATH ?? ""}` }
});

child.on("error", (error) => {
  console.error(`No se pudo ejecutar Go: ${error.message}`);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
