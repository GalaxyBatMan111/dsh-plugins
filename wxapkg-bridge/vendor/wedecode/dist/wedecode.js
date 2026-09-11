#!/usr/bin/env node
import { Command } from "commander";
import { c as clearScreen, Y as YesOrNoEnum, C as CacheClearEnum, P as PUBLIC_OUTPUT_PATH, s as sleep, O as OperationModeEnum, p as printLog, i as isWxAppid, A as AppMainPackageNames, g as globPathList, W as WxAppInfoUtils, S as StreamPathDefaultEnum, D as DecompilationController } from "./decompilation-controller.js";
import fs from "node:fs";
import path from "node:path";
import { glob } from "glob";
import inquirer from "inquirer";
import colors from "picocolors";
import { SelectTableTablePrompt } from "@biggerstar/inquirer-selectable-table";
import process$1 from "node:process";
import checkForUpdate from "update-check";
import figlet from "figlet";
import axios from "axios";
import openFileExplorer from "open-file-explorer";
import { W as WorkspaceServer } from "./workspace/workspace-server.js";
import "single-line-log";
import "js-beautify";
import "node:os";
import "@biggerstar/deepmerge";
import "vm2";
import "jsdom";
import "cheerio";
import "cssbeautify";
import "esprima";
import "escodegen";
import "node:crypto";
import "express";
import "cors";
import "multer";
import "ws";
import "node:http";
import "node:child_process";
import "url";
const name = "wedecode";
const version = "0.0.0";
const type = "module";
const description = "微信小程序源代码还原工具, 线上代码安全审计";
const bin = {
  wedecode: "./dist/wedecode.js"
};
const scripts = {
  bootstrap: "pnpm install",
  start: "vite build && node dist/wedecode.js",
  dev: "vite build --watch",
  build: "vite build",
  ui: "vite build && node dist/wedecode.js ui",
  "workspace:init": "vite build && node dist/workspace/workspace-cli.js init",
  "workspace:start": "vite build && node dist/workspace/workspace-cli.js start",
  "workspace:dev": "vite build && node dist/workspace/workspace-cli.js start -p 3000",
  "test:cmd": "wedecode",
  "test:cmd:dev": "DEV=true  wedecode",
  "test:cmd:args": "DEV=true wedecode -o OUTPUT",
  link: "vite build && pnpm link --dir= ./",
  unlink: "pnpm unlink",
  "release:npm": "vite build && npm publish",
  "release:git": 'vite build && git commit -am "chore: release v$npm_package_version" && git tag $npm_package_version && git push --tags ',
  "dev:unpack:dir": "DEV=true wedecode --clear -o OUTPUT pkg/wx1736dcbd36f4c055",
  "dev:unpack:subPack": "DEV=true wedecode --clear -o OUTPUT pkg/mt/_mobike_.wxapkg",
  "dev:unpack:game-dir": "DEV=true wedecode --clear -o OUTPUT-GAME pkg/weixin-dushu",
  "preview:unpack": "wedecode -ow true -o OUTPUT pkg/issues8-sxd",
  prepare: "husky",
  commitlint: "commitlint --edit",
  "commitlint:last": "commitlint --from HEAD~1 --to HEAD --verbose"
};
const repository = {
  type: "git",
  url: "git+https://github.com/biggerstar/wedecode.git"
};
const license = "GPL-3.0-or-later";
const bugs = {
  url: "https://github.com/biggerstar/wedecode/issues"
};
const files = [
  "dist",
  "public",
  "decryption-tool"
];
const homepage = "https://github.com/biggerstar/wedecode#readme";
const publishConfig = {
  registry: "https://registry.npmjs.org/"
};
const dependencies = {
  "@biggerstar/deepmerge": "^1.0.3",
  "@biggerstar/inquirer-selectable-table": "^1.0.12",
  axios: "^1.7.4",
  cheerio: "1.0.0-rc.12",
  commander: "^12.1.0",
  cors: "^2.8.5",
  cssbeautify: "^0.3.1",
  escodegen: "^1.14.3",
  esprima: "^4.0.1",
  express: "^5.1.0",
  figlet: "^1.7.0",
  glob: "^10.4.1",
  inquirer: "^9.2.23",
  "js-beautify": "^1.15.1",
  jsdom: "^24.1.0",
  multer: "^2.0.2",
  "open-file-explorer": "^1.0.2",
  picocolors: "^1.0.1",
  "single-line-log": "^1.1.2",
  "update-check": "^1.5.4",
  vm2: "^3.9.19",
  ws: "^8.18.3"
};
const devDependencies = {
  "@types/cors": "^2.8.19",
  "@types/cssbeautify": "^0.3.5",
  "@types/escodegen": "^0.0.10",
  "@types/esprima": "^4.0.6",
  "@types/express": "^5.0.3",
  "@types/figlet": "^1.5.8",
  "@types/inquirer": "^9.0.7",
  "@types/js-beautify": "^1.14.3",
  "@types/jsdom": "^21.1.7",
  "@types/multer": "^2.0.0",
  "@types/node": "^20.14.2",
  "@types/open-file-explorer": "^1.0.2",
  "@types/single-line-log": "^1.1.2",
  "@types/ws": "^8.18.1",
  "@commitlint/cli": "^19.4.0",
  "@commitlint/config-conventional": "^19.4.0",
  husky: "^9.0.11",
  lerna: "^8.1.7",
  "rollup-plugin-copy": "^3.5.0",
  ttypescript: "^1.5.15",
  "typescript-transform-paths": "^3.5.5",
  vite: "^5.2.13",
  "vite-tsconfig-paths": "^5.1.4"
};
const keywords = [
  "wxapkg",
  "Decompilation",
  "小程序",
  "反编译",
  "审计",
  "安全",
  "可视化操作"
];
const pkg = {
  name,
  version,
  type,
  description,
  bin,
  scripts,
  repository,
  license,
  bugs,
  files,
  homepage,
  publishConfig,
  dependencies,
  devDependencies,
  keywords
};
inquirer.registerPrompt("table", SelectTableTablePrompt);
process$1.stdout.setMaxListeners(200);
async function onResize() {
  if (lastTableOptions) {
    await prompts.showScanPackTable(lastTableOptions);
    clearScreen();
  }
}
let lastTableOptions = null;
let online = false;
async function checkOnline() {
  online = await internetAvailable();
}
setTimeout(checkOnline, 0);
const prompts = {
  async selectMode() {
    const offlineTip = `( ${colors.yellow("联网可显示小程序信息")} )`;
    const onlineTip = `( ${colors.green("网络正常")} )`;
    await sleep(1e3);
    return inquirer["prompt"](
      [
        {
          type: "list",
          message: `请选择操作模式 ? ${!online ? offlineTip : onlineTip}`,
          name: "selectMode",
          choices: [
            OperationModeEnum.autoScan,
            OperationModeEnum.manualScan,
            OperationModeEnum.manualDir
          ]
        }
      ]
    );
  },
  async inputManualScanPath() {
    return inquirer["prompt"](
      [
        {
          type: "input",
          message: `输入您要扫描的小程序包路径 ( ${colors.yellow(".")} 表示使用当前路径 ): `,
          name: "manualScanPath",
          validate(input) {
            if (!input) return false;
            return checkExistsWithFilePath(input, { throw: true, checkWxapkg: false, showInputPathLog: false });
          }
        }
      ]
    );
  },
  async showDangerScanPrompt(_path) {
    return inquirer["prompt"](
      [
        {
          type: "list",
          message: `您指定的路径可能会花大量时间扫描文件系统, 确定继续 ? ${colors.yellow(_path)}`,
          name: "dangerScan",
          choices: [
            YesOrNoEnum.no,
            YesOrNoEnum.yes
          ],
          default: YesOrNoEnum.no
        }
      ]
    );
  },
  async showScanPackTable(opt) {
    lastTableOptions = opt;
    if (!onResize["onResize"]) {
      process$1.stdout.on("resize", onResize);
      onResize["onResize"] = true;
    }
    await sleep(50);
    clearScreen();
    const part = process$1.stdout.columns / 10;
    const result = await inquirer["prompt"](
      [
        {
          type: "table",
          name: "packInfo",
          message: "",
          pageSize: 6,
          showIndex: true,
          tableOptions: {
            // wordWrap: true,
            wrapOnWordBoundary: true,
            colWidths: [part / 2, part * 2, part * 2, part * 5.3].map((n) => Math.floor(n))
          },
          columns: opt.columns || [],
          rows: opt.rows || []
        }
      ]
    );
    onResize["onResize"] = false;
    process$1.stdout.off("resize", onResize);
    return result;
  },
  async questionInputPath() {
    return inquirer["prompt"](
      [
        {
          type: "input",
          message: `输入 ${colors.blue("wxapkg文件")} 或 ${colors.blue("目录")} 默认为( ${colors.yellow("./")} ): `,
          name: "inputPath",
          validate(input, _) {
            return checkExistsWithFilePath(path.resolve(input), { throw: true });
          }
        }
      ]
    );
  },
  async questionOutputPath() {
    return inquirer["prompt"](
      [
        {
          type: "input",
          message: `输出目录, 默认为当前所在目录的( ${colors.yellow(PUBLIC_OUTPUT_PATH)} ): `,
          name: "outputPath"
        }
      ]
    );
  },
  async isClearOldCache(cachePath = "") {
    return inquirer["prompt"](
      [
        {
          type: "list",
          message: `输出目录中存在上次旧的编译产物，是否清空 ? 
  ${colors.blue(`当前缓存路径( ${colors.yellow(cachePath)} )`)}`,
          name: "isClearCache",
          choices: [
            CacheClearEnum.clear,
            CacheClearEnum.notClear
          ]
        }
      ]
    );
  },
  async showFileExplorer() {
    return inquirer["prompt"](
      [
        {
          type: "list",
          message: `
 将打开文件管理器, 确定继续 ?`,
          name: "showFileExplorer",
          choices: [
            YesOrNoEnum.no,
            YesOrNoEnum.yes
          ],
          default: YesOrNoEnum.no
        }
      ]
    );
  }
};
function createNewVersionUpdateNotice() {
  let updateInfo;
  return {
    /** 进行查询 */
    query() {
      checkForUpdate(pkg).then((res) => updateInfo = res).catch(() => void 0);
    },
    /**
     * 异步使用， 时间错开，因为查询需要时间， 如果查询到新版本， 则进行通知
     * 基于 update-check 如果本次查到更新但是没通知， 下次启动将会从缓存中获取版本信息并通知
     * */
    async notice() {
      await sleep(200);
      if (updateInfo && updateInfo.latest) {
        printLog(`
    🎉  wedecode 有新版本:  v${pkg.version}  -->  v${updateInfo.latest}
    🎄  您可以直接使用  ${colors.blue(`npm i -g wedecode@${updateInfo.latest}`)}  进行更新
    💬  npm地址:  https://www.npmjs.com/package/wedecode  
      
`, {
          isStart: true
        });
      } else {
        printLog(`
              🎄  当前使用版本:  v${pkg.version}
      
`, {
          isStart: true
        });
      }
    }
  };
}
function createSlogan(str = "    wedecode") {
  const slogan = figlet.textSync(str, {
    horizontalLayout: "default",
    verticalLayout: "default",
    whitespaceBreak: true
  });
  return colors.bold(colors.yellow(slogan));
}
async function startCacheQuestionProcess(isClear, inputPath, outputPath) {
  const OUTPUT_PATH = path.resolve(outputPath);
  if (fs.existsSync(OUTPUT_PATH)) {
    const isClearCache = isClear ? CacheClearEnum.clear : (await prompts.isClearOldCache(OUTPUT_PATH))["isClearCache"];
    if (isClearCache === CacheClearEnum.clear || isClear) {
      fs.rmSync(OUTPUT_PATH, { recursive: true });
      printLog(`
 ▶ 移除旧产物成功 `);
    }
  }
}
function checkExistsWithFilePath(targetPath, opt) {
  const { throw: isThrow = true, checkWxapkg = true, showInputPathLog = true } = opt || {};
  const printErr = (log) => {
    if (showInputPathLog) {
      console.log("\n输入路径: ", colors.yellow(path.resolve(targetPath)));
    }
    isThrow && console.log(`${colors.red(`❌   ${log}`)}
`);
  };
  if (!fs.existsSync(targetPath)) {
    printErr("文件 或者 目录不存在, 请检查!");
    return false;
  }
  if (checkWxapkg) {
    const isDirectory = fs.statSync(targetPath).isDirectory();
    if (isDirectory) {
      const wxapkgPathList = glob.globSync(`${targetPath}/*.wxapkg`);
      if (!wxapkgPathList.length) {
        console.log(
          "\n",
          colors.red("❌  文件夹下不存在 .wxapkg 包"),
          colors.yellow(path.resolve(targetPath)),
          "\n"
        );
        return false;
      }
    }
  }
  return true;
}
function stopCommander() {
  console.log(colors.red("❌  操作已主动终止!"));
  process$1.exit(0);
}
function getPathSplitList(_path) {
  let delimiter = "\\";
  let partList;
  partList = _path.split("\\");
  if (partList.length <= 1) {
    delimiter = "/";
    partList = _path.split("/");
  }
  return {
    partList,
    delimiter
  };
}
function findWxAppIdPath(_path) {
  const { partList, delimiter } = getPathSplitList(_path);
  let newPathList = [...partList];
  for (const index in partList.reverse()) {
    const dirName = partList[index];
    if (isWxAppid(dirName)) {
      break;
    }
    newPathList.pop();
  }
  return newPathList.join(delimiter).trim();
}
function findWxAppIdForPath(_path) {
  return path.parse(findWxAppIdPath(_path)).name;
}
async function internetAvailable() {
  return axios.request({
    url: "https://bing.com",
    maxRedirects: 0,
    timeout: 2e3,
    validateStatus: () => true
  }).then(() => true).catch(() => Promise.resolve(false));
}
function inDangerScanPathList(_path) {
  _path = path.resolve(_path);
  let partList;
  if (_path.includes(":")) _path = _path.split(":")[1];
  partList = getPathSplitList(_path).partList;
  return partList.map((s) => s.trim()).filter(Boolean).length <= 1;
}
function findWxMiniProgramPackDir(manualScanPath) {
  const foundPackageList = [];
  glob.globSync(path.resolve(manualScanPath, "**/*.wxapkg"), {
    dot: true,
    windowsPathsNoEscape: true,
    nocase: true
  }).map((_path) => {
    const foundMainPackage = AppMainPackageNames.find((fileName) => _path.endsWith(fileName));
    if (foundMainPackage) return _path;
    return false;
  }).filter(Boolean).reduce((pre, cur) => {
    if (pre.includes(cur)) return pre;
    pre.push(cur);
    return pre;
  }, []).forEach((_path) => {
    const foundPath = findWxAppIdPath(_path);
    const isFoundWxId = !!foundPath;
    let appIdPath = path.dirname(_path);
    const { partList } = getPathSplitList(appIdPath);
    let appId = partList.filter(Boolean).pop();
    if (isFoundWxId) {
      appIdPath = foundPath;
      appId = findWxAppIdForPath(_path);
    }
    foundPackageList.push({
      isAppId: isFoundWxId,
      appId,
      path: isFoundWxId ? foundPath : appIdPath,
      storagePath: path.dirname(_path)
    });
  });
  return foundPackageList;
}
async function sacnPackages(manualScanPath = "") {
  const foundPackageList = [];
  let scanPathList = globPathList;
  if (Boolean(manualScanPath.trim())) {
    const absolutePath = path.resolve(manualScanPath);
    if (inDangerScanPathList(absolutePath)) {
      const { dangerScan } = await prompts.showDangerScanPrompt(absolutePath);
      if (dangerScan === YesOrNoEnum.no) {
        stopCommander();
      }
    }
    scanPathList = [absolutePath];
  }
  if (scanPathList.length) {
    console.log(" 扫描中...");
  }
  scanPathList.forEach((matchPath) => {
    const foundPList = findWxMiniProgramPackDir(matchPath);
    foundPList.forEach((item) => foundPackageList.push(item));
  });
  if (foundPackageList.length === 0) {
    console.log(`
      ${colors.red("未找到小程序包，您需要电脑先访问某个小程序后产生缓存再扫描， 如果还扫描不到请反馈 ")}    
      当前所处目录: $ ${colors.yellow(path.resolve(manualScanPath || "./"))}
      
      ▶ 随着微信版本更新, 新版本小程序路径可能和已知位置不一样, 如果出现问题请到 github 反馈
      ▶ 提交时请带上您电脑中小程序的 '${colors.bold("微信官方的 wxapkg 包在硬盘中的存放路径")}' 和 '${colors.bold("微信版本号")}'
      ▶ https://github.com/biggerstar/wedecode/issues
      `);
    stopCommander();
  }
  return foundPackageList;
}
async function startSacnPackagesProcess(manualScanPath) {
  const foundPackageList = await sacnPackages(manualScanPath);
  const sortedPackageList = [...foundPackageList].map((item) => ({
    item,
    statInfo: fs.statSync(item.storagePath)
  })).sort((a, b) => b.statInfo.mtimeMs - a.statInfo.mtimeMs);
  const columns = [
    {
      name: "名字",
      value: "appName"
    },
    {
      name: "修改时间",
      value: "updateDate"
    },
    {
      name: "描述",
      value: "description"
    }
  ];
  const rowsPromiseList = sortedPackageList.map(async ({ item, statInfo }) => {
    const date = new Date(statInfo.mtime);
    const dateString = `${date.getMonth() + 1}/${date.getDate()} ${date.toLocaleTimeString()}`;
    if (!item.isAppId) return {
      appName: item.appId,
      updateDate: dateString,
      description: item.storagePath
    };
    const appId = item.appId;
    const { nickname, description: description2 } = await getWxAppInfo(appId);
    return {
      appName: nickname || appId,
      updateDate: dateString,
      description: description2 || ""
    };
  });
  if (rowsPromiseList.length) {
    console.log(" 获取小程序信息中...");
  }
  const rows = await Promise.all(rowsPromiseList);
  if (rowsPromiseList.length) {
    clearScreen();
    console.log("$ 选择一个包进行编译: ");
  }
  const result = await prompts.showScanPackTable({
    columns,
    rows
  });
  const foundIndex = rows.findIndex((item) => {
    var _a;
    return item.appName === ((_a = result.packInfo) == null ? void 0 : _a.appName);
  });
  const packInfo = { ...rows[foundIndex], ...sortedPackageList[foundIndex].item };
  console.log(`$ 选择了 ${packInfo.appName}( ${packInfo.appId} )`);
  return packInfo;
}
async function getWxAppInfo(appid) {
  return WxAppInfoUtils.getWxAppInfo(appid);
}
async function findLatestPackageStoragePath() {
  const foundPackageList = [];
  globPathList.forEach((matchPath) => {
    try {
      foundPackageList.push(...findWxMiniProgramPackDir(matchPath));
    } catch (_) {
    }
  });
  if (!foundPackageList.length) return null;
  const latest = [...foundPackageList].map((item) => ({ item, statInfo: fs.statSync(item.storagePath) })).sort((a, b) => b.statInfo.mtimeMs - a.statInfo.mtimeMs)[0];
  return latest.item.storagePath;
}
async function setInputAndOutputPath(config, opt, isAuto = false) {
  const { hasInputPath = false, hasOutputPath = false } = opt || {};
  let packInfo;
  if (!hasInputPath) {
    if (isAuto) {
      const latestStoragePath = await findLatestPackageStoragePath();
      if (!latestStoragePath) {
        console.error(colors.red("\n ✖ 未扫描到任何微信小程序包，请先在电脑端微信打开要反编译的小程序再重试"));
        process.exit(1);
      }
      config.inputPath = latestStoragePath;
      console.log(colors.cyan(" ▶ [自动模式] 命中缓存包: ") + colors.yellow(latestStoragePath));
    } else {
      const { selectMode } = await prompts.selectMode();
      if (selectMode === OperationModeEnum.autoScan) {
        packInfo = await startSacnPackagesProcess();
        config.inputPath = packInfo.storagePath;
      } else if (selectMode === OperationModeEnum.manualScan) {
        const { manualScanPath } = await prompts.inputManualScanPath();
        packInfo = await startSacnPackagesProcess(manualScanPath);
        config.inputPath = packInfo.storagePath;
      } else {
        const { inputPath } = await prompts.questionInputPath();
        config.inputPath = inputPath || config.inputPath;
      }
    }
  }
  if (!hasOutputPath) {
    let outputSubName = StreamPathDefaultEnum.defaultOutputPath;
    if (packInfo) {
      outputSubName = packInfo.appName || packInfo.appId;
    } else if (isAuto) {
      outputSubName = path.basename(path.dirname(config.inputPath)) || StreamPathDefaultEnum.defaultOutputPath;
      config.outputPath = path.resolve(process.cwd(), StreamPathDefaultEnum.publicOutputPath, outputSubName);
      return;
    } else {
      const { outputPath } = await prompts.questionOutputPath();
      outputSubName = outputPath || outputSubName;
    }
    config.outputPath = path.resolve((packInfo == null ? void 0 : packInfo.storagePath) || "./", StreamPathDefaultEnum.publicOutputPath, outputSubName);
  }
}
async function startMainCommanderProcess(args, argMap) {
  const hasInputPath = !!args[0];
  const hasOutputPath = !!argMap.out;
  const isAuto = !!argMap.auto;
  const isClear = argMap.clear || isAuto;
  const config = {
    inputPath: args[0] || StreamPathDefaultEnum.inputPath,
    outputPath: argMap.out || StreamPathDefaultEnum.defaultOutputPath
  };
  await setInputAndOutputPath(config, { hasInputPath, hasOutputPath }, isAuto);
  if (!checkExistsWithFilePath(config.inputPath, { throw: true })) return false;
  await startCacheQuestionProcess(isClear, config.inputPath, config.outputPath);
  const decompilationController = new DecompilationController(config.inputPath, config.outputPath);
  decompilationController.setState({
    usePx: argMap.px || false,
    unpackOnly: argMap.unpackOnly || false,
    wxid: argMap.wxid || null
  });
  await decompilationController.startDecompilerProcess();
  if (argMap.openDir) {
    console.log("\n ▶ 打开文件管理器: ", colors.yellow(path.resolve(config.outputPath)));
    openFileExplorer(config.outputPath, () => void 0);
  } else {
    console.log("\n ▶ 输出路径: ", colors.yellow(path.resolve(config.outputPath)));
  }
  await sleep(500);
  return true;
}
const notice = createNewVersionUpdateNotice();
notice.query();
const program = new Command();
program.name("wedecode").usage("<command> [options]").description("▶ wxapkg 反编译工具").version(pkg.version).option("-o, --out <out-path>", "指定编译输出地目录， 正常是主包目录").option("--open-dir", " 结束编译后打开查看产物目录").option("--clear", "是否清空旧的产物").option("--px", "是否使用 px 像素单位解析 css， 默认使用的是 rpx 单位").option("--unpack-only", "是否只进行解包，不进行反编译").option("--wxid <wxid>", "指定微信小程序的 WXID，用于获取小程序信息").option("--auto", "[优化] 自动模式: 全程无交互，自动扫描微信缓存中最近使用的小程序包并反编译").action(async (argMap, options) => {
  await sleep(200);
  const args = options.args || [];
  clearScreen();
  await sleep(100);
  printLog(createSlogan(), { isStart: true });
  if (!argMap.auto) {
    await notice.notice();
  }
  await startMainCommanderProcess(args, argMap);
  process.exit(0);
});
program.command("ui").description("启动 Web UI 界面").option("-p, --port <port>", "指定服务器端口", "3000").action(async (options) => {
  const port = parseInt(options.port);
  clearScreen();
  await sleep(100);
  printLog(createSlogan(), { isStart: true });
  new WorkspaceServer(port);
});
program.parse();
