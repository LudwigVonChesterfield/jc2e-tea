// Boots the Astro site (build + preview, or dev) for scripts to drive with Playwright.

import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import process from "node:process";

const PROJECT_ROOT = new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function waitForServer(url, child, { timeoutMs = 180_000, intervalMs = 300 } = {}) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    let settled = false;

    const onExit = (code) => {
      if (settled) return;
      settled = true;
      reject(
        new Error(
          `The dev/preview process exited (code ${code}) before it came up - see its output above ` +
            `for the actual error (often an Astro content/schema error, not a network issue).`
        )
      );
    };
    child.once("exit", onExit);

    const attempt = () => {
      if (settled) return;
      const req = http.get(url, (res) => {
        res.resume();
        if (!settled) {
          settled = true;
          child.off("exit", onExit);
          resolve();
        }
      });
      req.on("error", () => {
        if (settled) return;
        if (Date.now() > deadline) {
          settled = true;
          child.off("exit", onExit);
          reject(new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`));
        } else {
          setTimeout(attempt, intervalMs);
        }
      });
    };
    attempt();
  });
}

/**
 * @param {object} options
 * @param {"preview"|"dev"} [options.mode]
 * @param {number} [options.port]
 * @param {boolean} [options.skipBuild] - reuse an existing dist/ when mode is "preview"
 * @param {number} [options.readyTimeoutMs] - how long to wait for the server to respond
 * @returns {Promise<{ baseUrl: string, stop: () => Promise<void> }>}
 */
export async function startServer({ mode = "dev", port = 4319, skipBuild = false, readyTimeoutMs } = {}) {
  const base = "/jc2e-tea";
  const baseUrl = `http://127.0.0.1:${port}${base}/`;

  if (mode === "preview" && !skipBuild) {
    console.log("Building the site (npm run build)...");
    const build = spawnSync("npm", ["run", "build"], {
      cwd: PROJECT_ROOT,
      stdio: "inherit",
      shell: true,
    });
    if (build.status !== 0) {
      throw new Error(`"npm run build" failed with exit code ${build.status}`);
    }
  }

  const script = mode === "preview" ? "preview" : "dev";
  console.log(`Starting Astro ${mode} server on port ${port}...`);
  const child = spawn(
    "npm",
    ["run", script, "--", "--port", String(port), "--host", "127.0.0.1"],
    { cwd: PROJECT_ROOT, stdio: "inherit", shell: true }
  );

  let exited = false;
  child.on("exit", () => {
    exited = true;
  });

  function killTree() {
    if (process.platform === "win32") {
      // child was spawned with shell:true, so child.kill() only kills the
      // cmd.exe wrapper, not the astro/node process underneath it.
      spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    } else {
      child.kill();
    }
  }

  try {
    await waitForServer(baseUrl, child, readyTimeoutMs ? { timeoutMs: readyTimeoutMs } : undefined);
  } catch (err) {
    if (!exited) killTree();
    throw err;
  }

  return {
    baseUrl,
    async stop() {
      if (exited) return;
      await new Promise((resolve) => {
        child.once("exit", () => resolve());
        killTree();
        setTimeout(resolve, 3000);
      });
    },
  };
}
