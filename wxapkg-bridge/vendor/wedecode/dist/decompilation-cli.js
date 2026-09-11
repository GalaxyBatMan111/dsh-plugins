import { D as DecompilationController } from "./decompilation-controller.js";
import "node:fs";
import "node:path";
import "node:process";
import "single-line-log";
import "js-beautify";
import "node:os";
import "axios";
import "@biggerstar/deepmerge";
import "picocolors";
import "vm2";
import "jsdom";
import "glob";
import "cheerio";
import "cssbeautify";
import "esprima";
import "escodegen";
import "node:crypto";
const scriptRel = "modulepreload";
const assetsURL = function(dep) {
  return "/" + dep;
};
const seen = {};
const __vitePreload = function preload(baseModule, deps, importerUrl) {
  let promise = Promise.resolve();
  if (deps && deps.length > 0) {
    const links = document.getElementsByTagName("link");
    const cspNonceMeta = document.querySelector(
      "meta[property=csp-nonce]"
    );
    const cspNonce = (cspNonceMeta == null ? void 0 : cspNonceMeta.nonce) || (cspNonceMeta == null ? void 0 : cspNonceMeta.getAttribute("nonce"));
    promise = Promise.allSettled(
      deps.map((dep) => {
        dep = assetsURL(dep, importerUrl);
        if (dep in seen) return;
        seen[dep] = true;
        const isCss = dep.endsWith(".css");
        const cssSelector = isCss ? '[rel="stylesheet"]' : "";
        const isBaseRelative = !!importerUrl;
        if (isBaseRelative) {
          for (let i = links.length - 1; i >= 0; i--) {
            const link2 = links[i];
            if (link2.href === dep && (!isCss || link2.rel === "stylesheet")) {
              return;
            }
          }
        } else if (document.querySelector(`link[href="${dep}"]${cssSelector}`)) {
          return;
        }
        const link = document.createElement("link");
        link.rel = isCss ? "stylesheet" : scriptRel;
        if (!isCss) {
          link.as = "script";
        }
        link.crossOrigin = "";
        link.href = dep;
        if (cspNonce) {
          link.setAttribute("nonce", cspNonce);
        }
        document.head.appendChild(link);
        if (isCss) {
          return new Promise((res, rej) => {
            link.addEventListener("load", res);
            link.addEventListener(
              "error",
              () => rej(new Error(`Unable to preload CSS for ${dep}`))
            );
          });
        }
      })
    );
  }
  function handlePreloadError(err) {
    const e = new Event("vite:preloadError", {
      cancelable: true
    });
    e.payload = err;
    window.dispatchEvent(e);
    if (!e.defaultPrevented) {
      throw err;
    }
  }
  return promise.then((res) => {
    for (const item of res || []) {
      if (item.status !== "rejected") continue;
      handlePreloadError(item.reason);
    }
    return baseModule().catch(handlePreloadError);
  });
};
async function main() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.error("Usage: node decompilation-cli.js <inputPath1> [inputPath2...] <outputPath> <workspaceId> [options...]");
    process.exit(1);
  }
  let options = [];
  let nonOptionArgs = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      options.push(arg);
      if (arg === "--wxid" && i + 1 < args.length && !args[i + 1].startsWith("--")) {
        i++;
        options.push(args[i]);
      }
    } else {
      nonOptionArgs.push(arg);
    }
  }
  if (nonOptionArgs.length < 3) {
    console.error("需要至少3个非选项参数: <inputPath1> [inputPath2...] <outputPath> <workspaceId>");
    process.exit(1);
  }
  const outputPath = nonOptionArgs[nonOptionArgs.length - 2];
  const workspaceId = nonOptionArgs[nonOptionArgs.length - 1];
  const inputPaths = nonOptionArgs.slice(0, -2);
  if (inputPaths.length === 0) {
    console.error("至少需要提供一个输入文件路径");
    process.exit(1);
  }
  try {
    let inputPath;
    if (inputPaths.length === 1) {
      inputPath = inputPaths[0];
    } else {
      const fs = await __vitePreload(() => import("node:fs"), true ? [] : void 0);
      const path = await __vitePreload(() => import("node:path"), true ? [] : void 0);
      const os = await __vitePreload(() => import("node:os"), true ? [] : void 0);
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wedecode-multi-"));
      for (const filePath of inputPaths) {
        const fileName = path.basename(filePath);
        const destPath = path.join(tempDir, fileName);
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
          fs.cpSync(filePath, destPath, { recursive: true });
        } else {
          fs.copyFileSync(filePath, destPath);
        }
      }
      inputPath = tempDir;
    }
    const controller = new DecompilationController(inputPath, outputPath, workspaceId);
    const config = {
      usePx: options.includes("--px"),
      unpackOnly: options.includes("--unpack-only"),
      wxid: null
    };
    const wxidIndex = options.indexOf("--wxid");
    if (wxidIndex !== -1 && wxidIndex + 1 < options.length) {
      config.wxid = options[wxidIndex + 1];
    }
    controller.setState(config);
    console.log(`开始反编译: ${inputPath}`);
    console.log(`输出目录: ${outputPath}`);
    if (workspaceId) {
      console.log(`工作区ID: ${workspaceId}`);
    }
    console.log(`配置: ${JSON.stringify(config)}`);
    await controller.startDecompilerProcess();
    console.log("反编译完成!");
    process.exit(0);
  } catch (error) {
    console.error("反编译失败:", error.message);
    process.exit(1);
  }
}
main().catch((error) => {
  console.error("未处理的错误:", error);
  process.exit(1);
});
