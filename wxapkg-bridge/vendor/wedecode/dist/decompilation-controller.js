import fs from "node:fs";
import path from "node:path";
import process$1 from "node:process";
import { stdout } from "single-line-log";
import JS from "js-beautify";
import os from "node:os";
import axios from "axios";
import { deepmerge } from "@biggerstar/deepmerge";
import colors from "picocolors";
import { VM } from "vm2";
import { JSDOM } from "jsdom";
import { glob } from "glob";
import * as cheerio from "cheerio";
import cssbeautify from "cssbeautify";
import esprima from "esprima";
import escodegen from "escodegen";
import crypto from "node:crypto";
const isWindows = /^win/.test(process.platform);
const isMac = /^darwin/.test(process.platform);
const cssBodyToPageReg = /body\s*\{/g;
const PUBLIC_OUTPUT_PATH = "OUTPUT";
const pluginDirRename = ["__plugin__", "plugin_"];
const removeAppFileList = [
  // 'app-config.json',
  "page-frame.html",
  "app-wxss.js",
  "app-service.js",
  "index.appservice.js",
  "index.webview.js",
  "appservice.app.js",
  "page-frame.js",
  "webview.app.js",
  "common.app.js"
  // 'plugin.json',
];
const removeGameFileList = [
  // 'app-config.json',
  // 'game.js',
  "subContext.js",
  "worker.js"
];
const appJsonExcludeKeys = [
  "navigateToMiniProgramAppIdList"
];
const GameJsonExcludeKeys = [
  "openDataContext"
];
const macGlob = [
  // 版本3+
  "/Users/*/Library/Containers/*/Data/.wxapplet/packages",
  // 版本4.0+
  "/Users/*/Library/Containers/*/Data/Documents/app_data/radium/Applet/packages",
  // 版本4.1.7+ (Arm架构)
  "/Users/*/Library/Containers/*/Data/Documents/app_data/radium/users/*/applet/packages"
];
const winGlob = [
  // 版本3+
  "C:/Users/*/weixin/WeChat Files",
  "C:/Users/*/Documents/WeChat Files/Applet",
  // 版本4.0+
  "C:/Users/*/Documents/xwechat_files",
  "C:/Users/*/AppData/Roaming/*/xwechat/radium/Applet/packages",
  // 版本4.1.7+
  "C:/Users/*/AppData/Roaming/*/xwechat/radium/users",
  // 安装到其他盘
  "D:/WeChat Files/Applet",
  "E:/WeChat Files/Applet",
  "F:/WeChat Files/Applet"
];
const linuxGlob = [
  "/home/*/.config/WeChat/Applet"
];
function getPlatformGlob() {
  const platform = os.platform();
  switch (platform) {
    case "win32":
      return winGlob;
    case "darwin":
      return macGlob;
    case "linux":
      return linuxGlob;
    default:
      return [];
  }
}
const globPathList = getPlatformGlob();
const AppMainPackageNames = ["__APP__.wxapkg", "app.wxapkg"];
var CacheClearEnum = /* @__PURE__ */ ((CacheClearEnum2) => {
  CacheClearEnum2["clear"] = "清空";
  CacheClearEnum2["notClear"] = "不清空";
  return CacheClearEnum2;
})(CacheClearEnum || {});
var OperationModeEnum = /* @__PURE__ */ ((OperationModeEnum2) => {
  OperationModeEnum2["autoScan"] = "▶ 自动扫描小程序包";
  OperationModeEnum2["manualScan"] = "▶ 手动设定扫描目录";
  OperationModeEnum2["manualDir"] = "▶ 直接指定包路径( 非扫描 )";
  return OperationModeEnum2;
})(OperationModeEnum || {});
var StreamPathDefaultEnum = /* @__PURE__ */ ((StreamPathDefaultEnum2) => {
  StreamPathDefaultEnum2["inputPath"] = "./";
  StreamPathDefaultEnum2[StreamPathDefaultEnum2["publicOutputPath"] = PUBLIC_OUTPUT_PATH] = "publicOutputPath";
  StreamPathDefaultEnum2["defaultOutputPath"] = "default";
  return StreamPathDefaultEnum2;
})(StreamPathDefaultEnum || {});
var YesOrNoEnum = /* @__PURE__ */ ((YesOrNoEnum2) => {
  YesOrNoEnum2["yes"] = "是";
  YesOrNoEnum2["no"] = "否";
  return YesOrNoEnum2;
})(YesOrNoEnum || {});
const isDev = process$1.env.DEV === "true";
function getPathResolveInfo(outputDir) {
  let _packRootPath = outputDir;
  const resolve = (_new_resolve_path = "./", ...args) => {
    return path.resolve(outputDir, _packRootPath, _new_resolve_path, ...args);
  };
  const outputResolve = (_new_resolve_path = "./", ...args) => {
    return path.resolve(outputDir, _new_resolve_path, ...args);
  };
  return {
    /** 相对当前包( 子包， 主包， 插件包都算当前路径 )作为根路径路径进行解析 */
    resolve,
    /** 相对当前主包路径进行解析 */
    outputResolve,
    outputPath: outputDir,
    join(_path) {
      return path.join(_packRootPath, _path);
    },
    setPackRootPath(rootPath) {
      _packRootPath = rootPath;
    },
    /**
     * 当前的包根路径， 主包为 ./ , 分包为相对主包根的相对路径
     * */
    get packRootPath() {
      return _packRootPath === outputDir ? "./" : _packRootPath;
    },
    get appJsonPath() {
      return resolve("app.json");
    },
    get appConfigJsonPath() {
      return resolve("app-config.json");
    },
    get projectPrivateConfigJsonPath() {
      return resolve("project.private.config.json");
    },
    get appWxssPath() {
      return resolve("app-wxss.js");
    },
    get workersPath() {
      return resolve("workers.js");
    },
    get pageFramePath() {
      return resolve("page-frame.js");
    },
    get pageFrameHtmlPath() {
      return resolve("page-frame.html");
    },
    get appJsPath() {
      return resolve("app.js");
    },
    get appServicePath() {
      return resolve("app-service.js");
    },
    get appServiceAppPath() {
      return resolve("appservice.app.js");
    },
    get gameJsonPath() {
      return resolve("game.json");
    },
    get gameJsPath() {
      return resolve("game.js");
    },
    get subContextJsPath() {
      return resolve("subContext.js");
    }
  };
}
function jsBeautify(code) {
  return JS.js_beautify(code, { indent_size: 2 });
}
function traverseDOMTree(parentElement, astVNode, callback) {
  if (!astVNode) return;
  const newElement = callback(parentElement, astVNode);
  if (!newElement) return;
  const VNodeChildren = Array.from(astVNode.children).filter(Boolean);
  if (!VNodeChildren.length) return;
  for (let i = 0; i < VNodeChildren.length; i++) {
    traverseDOMTree(newElement, VNodeChildren[i], callback);
  }
}
function clearScreen() {
  process$1.stdout.write(process$1.platform === "win32" ? "\x1Bc" : "\x1B[2J\x1B[3J\x1B[H");
}
function limitPush(arr, data, limit = 10) {
  if (arr.length - 1 > limit) arr.shift();
  arr.push(data);
}
const openStreamLog = false;
const isChildProcess = process$1.argv.some((arg) => arg.includes("decompilation-cli.js") || arg.includes("decompilation-controller.js")) || process$1.env.WEDECODE_CHILD_PROCESS === "true";
const excludesLogMatch = isDev && !isChildProcess ? [
  "Completed"
] : [];
function printLog(log, opt = {}) {
  if (excludesLogMatch.some((item) => log.includes(item))) return;
  if (isChildProcess || !openStreamLog) {
    console.log(log);
    return;
  }
  if (!log || !log.trim()) return;
  if (opt.interceptor) printLog["interceptor"] = opt.interceptor;
  if (opt.space1) printLog["space1"] = opt.space1;
  if (opt.space2) printLog["space2"] = opt.space2;
  if (opt.nativeOnly) printLog["nativeOnly"] = opt.nativeOnly;
  if (!printLog["middleLogList"]) printLog["middleLogList"] = [];
  if (!printLog["startLogList"]) printLog["startLogList"] = [];
  if (!printLog["endLogList"]) printLog["endLogList"] = [];
  if (typeof printLog["interceptor"] === "function" && printLog["interceptor"](log) === false) {
    return;
  }
  if (printLog["nativeOnly"]) {
    console.log.call(console, log);
    return;
  }
  if (opt.isStart) {
    limitPush(printLog["startLogList"], log, opt.starLimit || 20);
  } else if (opt.isEnd) {
    limitPush(printLog["endLogList"], log, opt.middleLimit || 6);
  } else {
    limitPush(printLog["middleLogList"], log, opt.endLimit || 20);
  }
  log = printLog["startLogList"].join("\n") + (printLog["space1"] || "") + printLog["middleLogList"].join("\n") + (printLog["space2"] || "") + printLog["endLogList"].join("\n");
  clearScreen();
  stdout(log);
}
function removeElement(arr, elementToRemove) {
  const index = arr.indexOf(elementToRemove);
  if (index > -1) {
    arr.splice(index, 1);
  }
}
function commonDir(pathA, pathB) {
  if (pathA[0] === ".") pathA = pathA.slice(1);
  if (pathB[0] === ".") pathB = pathB.slice(1);
  pathA = pathA.replace(/\\/g, "/");
  pathB = pathB.replace(/\\/g, "/");
  let a = Math.min(pathA.length, pathB.length);
  for (let i = 1, m = Math.min(pathA.length, pathB.length); i <= m; i++) if (!pathA.startsWith(pathB.slice(0, i))) {
    a = i - 1;
    break;
  }
  let pub = pathB.slice(0, a);
  let len = pub.lastIndexOf("/") + 1;
  return pathA.slice(0, len);
}
function findCommonRoot(paths) {
  const splitPaths = paths.map((path2) => path2.split("/").filter(Boolean));
  const commonRoot = [];
  for (let i = 0; i < splitPaths[0].length; i++) {
    const partsMatch = splitPaths.every((path2) => path2[i] === splitPaths[0][i]);
    if (partsMatch) {
      commonRoot.push(splitPaths[0][i]);
    } else {
      break;
    }
  }
  return commonRoot.join("/");
}
function replaceExt(name, ext = "") {
  const hasSuffix = name.lastIndexOf(".") > 2;
  return hasSuffix ? name.slice(0, name.lastIndexOf(".")) + ext : `${name}${ext}`;
}
function sleep(time) {
  return new Promise((resolve1) => setTimeout(resolve1, time));
}
function arrayDeduplication(arr, cb) {
  return arr.reduce((pre, cur) => {
    const res = cb ? cb(pre, cur) : void 0;
    const isRes = typeof res === "boolean";
    isRes ? res && pre.push(cur) : !pre.includes(cur) && pre.push(cur);
    return pre;
  }, []);
}
function removeVM2ExceptionLine(code) {
  const reg = /\s*[a-z]\x20?=\x20?VM2_INTERNAL_STATE_DO_NOT_USE_OR_PROGRAM_WILL_FAIL\.handleException\([a-z]\);?/g;
  return code.replace(reg, "");
}
function resetWxsRequirePath(p, resetString = "") {
  return p.replaceAll("p_./", resetString).replaceAll("m_./", resetString);
}
function isPluginPath(path2) {
  return path2.startsWith("plugin-private://") || path2.startsWith("plugin://");
}
function resetPluginPath(_path, prefixDir) {
  return path.join(
    prefixDir || "./",
    _path.replaceAll("plugin-private://", "").replaceAll("plugin://", "")
  );
}
function getParameterNames(fn) {
  if (typeof fn !== "function") return [];
  const COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
  const code = fn.toString().replace(COMMENTS, "");
  const result = code.slice(code.indexOf("(") + 1, code.indexOf(")")).match(/([^\s,]+)/g);
  return result === null ? [] : result;
}
function isWxAppid(str) {
  const reg = /^wx[0-9a-f]{14,16}$/i;
  str = str.trim();
  return str.length >= 16 && str.length <= 18 && reg.test(str);
}
function readLocalFile(path2, encoding = "utf-8") {
  return fs.existsSync(path2) ? fs.readFileSync(path2, encoding) : "";
}
function readLocalJsonFile(path2, encoding = "utf-8") {
  try {
    return JSON.parse(readLocalFile(path2, encoding));
  } catch (e) {
    return null;
  }
}
function readFileUntilContainContent(pathList, encoding = "utf-8") {
  for (const filePath of pathList) {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, encoding);
      if (data.length) {
        return {
          found: true,
          data,
          path: filePath
        };
      }
    }
  }
  return {
    found: false,
    data: "",
    path: ""
  };
}
function saveLocalFile(filepath, data, opt = {}) {
  filepath = filepath.replace(pluginDirRename[0], pluginDirRename[1]);
  const targetData = fs.existsSync(filepath) ? fs.readFileSync(filepath, { encoding: "utf-8" }).trim() : "";
  let force = typeof opt.force === "boolean" ? opt.force : opt.emptyInstead || !targetData.length;
  const outputDirPath = path.dirname(filepath);
  const isExistsFile = fs.existsSync(filepath);
  const isExistsPath = fs.existsSync(outputDirPath);
  if (isExistsFile && !force) return false;
  if (!isExistsPath) {
    fs.mkdirSync(outputDirPath, { recursive: true });
  }
  fs.writeFileSync(filepath, data);
  return true;
}
function deleteLocalFile(path2, opt = {}) {
  try {
    fs.rmSync(path2, opt);
  } catch (e) {
    if (!opt.catch) throw e;
  }
}
class WxAppInfoUtils {
  /**
   * 从远程API获取小程序信息
   * @param appid 小程序的appid
   * @returns 小程序信息或空对象
   */
  static async getWxAppInfo(appid) {
    try {
      printLog(`🔍 正在获取小程序信息: ${appid}`, { isEnd: true });
      const response = await axios.post("https://kainy.cn/api/weapp/info/", {
        appid
      }, {
        timeout: 1e4,
        // 10秒超时
        headers: {
          "Content-Type": "application/json"
        }
      });
      if (response.data && response.data.code === 0 && response.data.data && response.data.data.nickname) {
        const appInfo = response.data.data;
        printLog(`✅ 成功获取小程序信息: ${appInfo.nickname}`, { isEnd: true });
        return appInfo;
      } else {
        printLog(`⚠️ 获取到的小程序信息为空或格式不正确`, { isEnd: true });
        return {};
      }
    } catch (error) {
      printLog(`❌ 获取小程序信息失败: ${error.message}`, { isEnd: true });
      if (error.response) {
        printLog(`📄 API错误响应: ${JSON.stringify(error.response.data)}`, { isEnd: true });
      }
      return {};
    }
  }
  /**
   * 更新工作区的小程序信息
   * @param workspaceId 工作区ID
   * @param appInfo 小程序信息
   * @param serverPort 服务器端口，默认3000
   */
  static async updateWorkspaceAppInfo(workspaceId, appInfo, serverPort = 3e3) {
    try {
      console.log(`正在更新工作区 ${workspaceId} 的小程序信息`);
      const response = await axios.put(
        `http://localhost:${serverPort}/api/workspaces/${workspaceId}/appinfo`,
        { appInfo },
        // 包装在对象中
        {
          timeout: 5e3,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
      if (response.status === 200) {
        console.log("工作区小程序信息更新成功");
      } else {
        console.error("工作区小程序信息更新失败:", response.statusText);
      }
    } catch (error) {
      console.error("更新工作区小程序信息时发生错误:", error);
    }
  }
  /**
   * 获取并更新小程序信息的完整流程
   * @param workspaceId 工作区ID
   * @param appid 小程序appid
   * @param outputPath 输出路径，用于提取本地信息（已废弃，不再使用）
   * @param serverPort 服务器端口，默认3000
   */
  static async fetchAndUpdateAppInfo(workspaceId, appid, outputPath, serverPort = 3e3) {
    const appInfo = await this.getWxAppInfo(appid);
    if (appInfo && Object.keys(appInfo).length > 0) {
      await this.updateWorkspaceAppInfo(workspaceId, appInfo, serverPort);
    }
  }
  /**
   * 从app.json文件中提取appid
   * @param appJsonPath app.json文件路径
   * @returns appid或null
   */
  static extractAppIdFromAppJson(appJsonPath) {
    try {
      if (!fs.existsSync(appJsonPath)) {
        return null;
      }
      const appJsonContent = readLocalFile(appJsonPath);
      if (!appJsonContent) {
        return null;
      }
      const appJson = JSON.parse(appJsonContent);
      return appJson.appid || null;
    } catch (error) {
      console.warn("解析app.json失败:", error.message);
      return null;
    }
  }
  /**
   * 从app-config.json文件中提取appid
   * @param appConfigPath app-config.json文件路径
   * @returns appid或null
   */
  static extractAppIdFromConfig(appConfigPath) {
    try {
      if (!fs.existsSync(appConfigPath)) {
        return null;
      }
      const appConfigContent = readLocalFile(appConfigPath);
      if (!appConfigContent) {
        return null;
      }
      const appConfig = JSON.parse(appConfigContent);
      return appConfig.appid || appConfig.extAppid || null;
    } catch (error) {
      console.warn("解析app-config.json失败:", error.message);
      return null;
    }
  }
  /**
   * 从多个来源提取小程序ID（只从app.json中提取）
   * @param outputPath 输出路径
   * @returns appid或null
   */
  static extractAppIdFromMultipleSources(outputPath) {
    const appJsonPath = path.join(outputPath, "app.json");
    let appId = this.extractAppIdFromAppJson(appJsonPath);
    if (appId) {
      printLog(`📱 从app.json中找到appid: ${appId}`, { isEnd: true });
      return appId;
    }
    return null;
  }
  /**
   * 尝试从反编译结果中获取并更新小程序信息
   * @param workspaceId 工作区ID
   * @param packInfo 反编译包信息
   * @param serverPort 服务器端口，默认3000
   * @param wxid 用户提供的微信小程序ID，优先使用
   */
  static async tryGetAndUpdateAppInfoFromPack(workspaceId, packInfo, serverPort = 3e3, wxid) {
    var _a;
    if (!workspaceId) return;
    try {
      let appid = null;
      if (wxid && wxid.trim()) {
        appid = wxid.trim();
      } else {
        const outputPath = ((_a = packInfo.pathInfo) == null ? void 0 : _a.outputPath) || packInfo.outputPath;
        appid = this.extractAppIdFromMultipleSources(outputPath);
        if (appid) {
          printLog(`🔍 从反编译文件中发现小程序ID: ${appid}，正在获取详细信息...`, { isEnd: true });
        }
      }
      if (appid) {
        await this.fetchAndUpdateAppInfo(workspaceId, appid, void 0, serverPort);
      } else {
        printLog(`⚠️ 未能找到小程序ID，跳过信息获取`, { isEnd: true });
      }
    } catch (error) {
      console.warn("获取小程序信息失败:", error.message);
    }
  }
}
class ProjectConfigUtils {
  /**
   * 生成小程序的项目配置文件
   * @param outputPath 输出路径
   */
  static async generateProjectConfigFiles(outputPath) {
    const projectPrivateConfigJsonPath = path.join(outputPath, "project.private.config.json");
    const DEV_defaultConfigData = {
      "setting": {
        "ignoreDevUnusedFiles": false,
        "ignoreUploadUnusedFiles": false
      }
    };
    const defaultConfigData = {
      "setting": {
        "es6": false,
        "urlCheck": false
      }
    };
    if (isDev) {
      Object.assign(defaultConfigData.setting, DEV_defaultConfigData.setting);
    }
    let finallyConfig = {};
    const projectPrivateConfigString = readLocalFile(projectPrivateConfigJsonPath);
    if (projectPrivateConfigString) {
      const projectPrivateConfigData = JSON.parse(projectPrivateConfigString);
      deepmerge(projectPrivateConfigData, defaultConfigData);
      finallyConfig = projectPrivateConfigData;
    } else {
      finallyConfig = defaultConfigData;
    }
    saveLocalFile(projectPrivateConfigJsonPath, JSON.stringify(finallyConfig, null, 2), { force: true });
    printLog(` ▶ 生成项目配置文件成功. 
`, { isStart: true });
  }
}
const proxyableSymbol = Symbol("proxyable");
const systemInfo = {
  windowWidth: 375,
  windowHeight: 600,
  pixelRatio: 2,
  language: "en",
  version: "1.9.90",
  platform: "ios"
};
function makeProxiesAble(defaultValue) {
  const knownProps = Object.keys(defaultValue);
  defaultValue[proxyableSymbol] = true;
  return new Proxy(defaultValue, {
    get(target, prop) {
      const value = target[prop];
      if (typeof value === "function") {
        return value.bind(target);
      }
      if ((value == null ? void 0 : value[proxyableSymbol]) || typeof value === "symbol" || typeof prop === "symbol") {
        return value;
      }
      if (!knownProps.includes(prop)) {
        console.log("获取到未知属性: 请反馈到 wedecode 项目中, 谢谢! ", prop);
      }
      return function() {
        return makeProxiesAble({});
      };
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    }
  });
}
const WX_API = {
  request() {
  },
  getExtConfig() {
  },
  getExtConfigSync() {
  },
  postMessageToReferrerPage: function() {
  },
  postMessageToReferrerMiniProgram: function() {
  },
  onUnhandledRejection: function() {
  },
  onThemeChange: function() {
  },
  onPageNotFound: function() {
  },
  onLazyLoadError: function() {
  },
  onError: function() {
  },
  onAudioInterruptionEnd: function() {
  },
  onAudioInterruptionBegin: function() {
  },
  onAppShow: function() {
  },
  onAppHide: function() {
  },
  offUnhandledRejection: function() {
  },
  offThemeChange: function() {
  },
  offPageNotFound: function() {
  },
  offLazyLoadError: function() {
  },
  offError: function() {
  },
  offAudioInterruptionEnd: function() {
  },
  offAudioInterruptionBegin: function() {
  },
  offAppShow: function() {
  },
  offAppHide: function() {
  },
  getStorageSync: function() {
  },
  setStorageSync: function() {
  },
  getStorage: function() {
  },
  setStorage: function() {
  },
  getSystemInfo() {
    return systemInfo;
  },
  getSystemInfoSync() {
    return systemInfo;
  },
  getRealtimeLogManager() {
    return {
      log: (msg) => console.log(msg),
      err: (msg) => console.error(msg)
    };
  },
  getMenuButtonBoundingClientRect() {
    return {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      width: 0,
      height: 0
    };
  }
};
function createWxFakeDom() {
  return makeProxiesAble({
    console,
    setTimeout,
    setInterval,
    clearTimeout,
    clearInterval,
    __wxConfig: {},
    App() {
    },
    Component() {
    },
    Page() {
    },
    getApp: () => ({}),
    require: () => void 0,
    module: {},
    exports: {},
    global: {},
    Behavior: function() {
    },
    getCurrentPages: () => [],
    requireMiniProgram: function() {
    },
    $gwx: () => void 0,
    WXWebAssembly: {},
    __wxCodeSpace__: {},
    wx: makeProxiesAble(WX_API),
    // 4.x support
    __appServiceSDK__: makeProxiesAble({
      loadSubpackage: () => void 0
    }),
    __subContextEngine__: makeProxiesAble({
      injectEntryFile: () => void 0,
      loadJsFiles: () => void 0
    })
  });
}
function createVM(vmOptions = {}) {
  const domBaseHtml = `<!DOCTYPE html><html lang="en"><head><title>''</title></head><body></body></html>`;
  const dom = new JSDOM(domBaseHtml);
  const vm_window = dom.window;
  const vm_navigator = dom.window.navigator;
  const vm_document = dom.window.document;
  const __wxAppCode__ = {};
  const fakeGlobal = {
    __wxAppCode__,
    publishDomainComponents: () => void 0
  };
  Object.assign(vm_window, fakeGlobal);
  return new VM(deepmerge({
    sandbox: {
      ...createWxFakeDom(),
      setInterval: () => null,
      setTimeout: () => null,
      console: {
        ...console,
        // 在 vm 执行的时候，对于小程序源码中的 info, log, warn 打印直接忽略
        log: () => void 0,
        warn: () => void 0,
        info: () => void 0
      },
      window: vm_window,
      location: dom.window.location,
      navigator: vm_navigator,
      document: vm_document,
      define: () => void 0,
      require: () => void 0,
      requirePlugin: () => void 0,
      global: {
        __wcc_version__: "v0.5vv_20211229_syb_scopedata"
      },
      System: {
        register: () => void 0
      },
      __vd_version_info__: {},
      __wxAppCode__,
      __wxCodeSpace__: {
        setRuntimeGlobals: () => void 0,
        addComponentStaticConfig: () => void 0,
        setStyleScope: () => void 0,
        enableCodeChunk: () => void 0,
        initializeCodeChunk: () => void 0,
        addTemplateDependencies: () => void 0,
        batchAddCompiledScripts: () => void 0,
        batchAddCompiledTemplate: () => void 0
      }
    }
  }, vmOptions));
}
function runVmCode(vm, code) {
  try {
    vm.run(code);
  } catch (e) {
    console.error(e.message);
  }
}
class PloyFillCover {
  allPloyFills = [];
  constructor(packPath) {
    const customHeaderPathPart = path.resolve(path.dirname(packPath), "polyfill");
    const customPloyfillGlobMatch = path.resolve(customHeaderPathPart, "./**/*.js");
    const customPloyfill = glob.globSync(customPloyfillGlobMatch);
    const customPloyfillInfo = customPloyfill.map((str) => {
      return { fullPath: str, ployfillPath: path.relative(customHeaderPathPart, str) };
    });
    const urls = new URL(import.meta.url);
    const headerPathPart = path.resolve(path.dirname(urls.pathname), "polyfill");
    const ployfillGlobMatch = path.resolve(headerPathPart, "./**/*.js");
    let builtinPloyfill = glob.globSync(ployfillGlobMatch);
    const builtinPloyfillInfo = builtinPloyfill.map((str) => {
      return { fullPath: str, ployfillPath: path.relative(headerPathPart, str) };
    });
    this.allPloyFills = [...customPloyfillInfo, ...builtinPloyfillInfo];
  }
  findPloyfill(targetPath) {
    return this.allPloyFills.find((item) => {
      return targetPath.endsWith(item.ployfillPath);
    });
  }
}
var PackTypeMapping = /* @__PURE__ */ ((PackTypeMapping2) => {
  PackTypeMapping2["main"] = "主包";
  PackTypeMapping2["sub"] = "分包";
  PackTypeMapping2["independent"] = "独立分包";
  return PackTypeMapping2;
})(PackTypeMapping || {});
var AppTypeMapping = /* @__PURE__ */ ((AppTypeMapping2) => {
  AppTypeMapping2["app"] = "小程序";
  AppTypeMapping2["game"] = "小游戏";
  return AppTypeMapping2;
})(AppTypeMapping || {});
class BaseDecompilation {
  pathInfo;
  outputPathInfo;
  packPath;
  packType;
  appType;
  ployFill;
  constructor(packInfo) {
    this.pathInfo = packInfo.pathInfo;
    this.outputPathInfo = packInfo.outputPathInfo;
    this.packPath = packInfo.inputPath;
    this.packType = packInfo.packType;
    this.appType = packInfo.appType;
    this.ployFill = new PloyFillCover(this.packPath);
  }
  async decompileAppWorker() {
    await sleep(200);
    if (!fs.existsSync(this.pathInfo.workersPath)) {
      return;
    }
    const appConfigString = readLocalFile(this.pathInfo.appJsonPath);
    if (!appConfigString) return;
    const appConfig = JSON.parse(appConfigString);
    let code = readLocalFile(this.pathInfo.workersPath);
    let commPath = "";
    let vm = createVM({
      sandbox: {
        define(name) {
          name = path.dirname(name) + "/";
          if (!commPath) commPath = name;
          commPath = commonDir(commPath, name);
        }
      }
    });
    runVmCode(vm, code.slice(code.indexOf("define(")));
    if (commPath.length > 0) commPath = commPath.slice(0, -1);
    printLog(`Worker path:  ${commPath}`);
    appConfig.workers = commPath;
    saveLocalFile(this.pathInfo.appJsonPath, JSON.stringify(appConfig, null, 2));
    printLog(` ▶ 反编译 Worker 文件成功. 
`, { isStart: true });
  }
  /**
   * 反编译 Worker 文件
   * */
  async decompileAppWorkers() {
    await sleep(200);
    if (!fs.existsSync(this.pathInfo.workersPath)) {
      return;
    }
    const _this = this;
    let commPath = "";
    let code = readLocalFile(this.pathInfo.workersPath);
    let vm = createVM({
      sandbox: {
        define(name, func) {
          _this._parseJsDefine(name, func);
          const workerPath = path.dirname(name) + "/";
          if (!commPath) commPath = workerPath;
          commPath = commonDir(commPath, workerPath);
        }
      }
    });
    runVmCode(vm, code);
    printLog(`Worker path:  ${commPath}`);
    if (commPath) {
      const configFileName = this.appType === "game" ? this.pathInfo.gameJsonPath : this.pathInfo.appJsonPath;
      const appConfig = JSON.parse(readLocalFile(configFileName));
      appConfig.workers = commPath;
      saveLocalFile(configFileName, JSON.stringify(appConfig, null, 2), { force: true });
    }
    printLog(` ▶ 反编译 Worker 文件成功. 
`, { isStart: true });
  }
  decompileAll() {
    printLog(` ▶ 当前反编译目标[ ${AppTypeMapping[this.appType]} ] (${colors.yellow(PackTypeMapping[this.packType])}) : ` + colors.blue(this.packPath));
    printLog(` ▶ 当前输出目录:  ${colors.blue(this.pathInfo.outputPath)}
`, {
      isEnd: true
    });
  }
  _parseJsDefine(name, func) {
    if (path.extname(name) !== ".js") return;
    const foundPloyfill = this.ployFill.findPloyfill(name);
    let resultCode = "";
    if (foundPloyfill) {
      resultCode = readLocalFile(foundPloyfill.fullPath);
    } else {
      let code = func.toString();
      code = code.slice(code.indexOf("{") + 1, code.lastIndexOf("}") - 1).trim();
      if (code.startsWith('"use strict";')) {
        code = code.replaceAll('"use strict";', "");
      } else if (code.startsWith("'use strict';")) {
        code = code.replaceAll(`'use strict';`, "");
      } else if ((code.startsWith('(function(){"use strict";') || code.startsWith("(function(){'use strict';")) && code.endsWith("})();")) {
        code = code.slice(25, -5);
      }
      code = code.replaceAll('require("@babel', 'require("./@babel');
      resultCode = jsBeautify(code.trim());
    }
    saveLocalFile(
      this.pathInfo.outputResolve(name),
      removeVM2ExceptionLine(resultCode.trim()),
      { force: true }
    );
    printLog(` Completed  (${resultCode.length}) 	` + colors.bold(colors.gray(name)));
  }
}
function getAppPackCodeInfo(pathInfo, opt = {}) {
  const { adaptLen = 100 } = opt || {};
  function __readFile(path2) {
    if (!path2) return "";
    const content = readLocalFile(path2);
    return content.length > adaptLen ? content : "";
  }
  let pageFrameHtmlCode = __readFile(pathInfo.pageFrameHtmlPath);
  if (pageFrameHtmlCode) {
    const $ = cheerio.load(pageFrameHtmlCode);
    pageFrameHtmlCode = $("script").text();
  }
  const appServiceCode = __readFile(pathInfo.appServicePath);
  const appServiceAppCode = __readFile(pathInfo.appServiceAppPath);
  return {
    appConfigJson: __readFile(pathInfo.appConfigJsonPath),
    appWxss: __readFile(pathInfo.appWxssPath),
    appService: appServiceCode,
    appServiceApp: appServiceAppCode,
    pageFrame: __readFile(pathInfo.pageFramePath),
    workers: __readFile(pathInfo.workersPath),
    pageFrameHtml: pageFrameHtmlCode
  };
}
function getGamePackCodeInfo(pathInfo, opt = {}) {
  const { adaptLen = 100 } = opt || {};
  function __readFile(path2) {
    if (!path2) return "";
    const content = readLocalFile(path2);
    return content.length > adaptLen ? content : "";
  }
  return {
    workers: __readFile(pathInfo.workersPath),
    gameJs: __readFile(pathInfo.gameJsPath),
    appConfigJson: __readFile(pathInfo.appConfigJsonPath),
    subContextJs: __readFile(pathInfo.subContextJsPath)
  };
}
class GameDecompilation extends BaseDecompilation {
  codeInfo;
  wxsList;
  allRefComponentList = [];
  allSubPackagePages = [];
  allPloyFill = [];
  constructor(packInfo) {
    super(packInfo);
  }
  /**
   * 初始化小游戏所需环境和变量
   * */
  async initGame() {
    this.codeInfo = getGamePackCodeInfo(this.pathInfo);
    const loadInfo = {};
    for (const name in this.codeInfo) {
      loadInfo[name] = this.codeInfo[name].length;
    }
    console.log(loadInfo);
  }
  /**
   * 反编译 game.json 文件， 只有主包需要处理
   * */
  async decompileGameJSON() {
    if (this.packType !== "main") return;
    await sleep(200);
    const gameConfigString = this.codeInfo.appConfigJson;
    const gameConfig = JSON.parse(gameConfigString);
    Object.assign(gameConfig, gameConfig.global);
    GameJsonExcludeKeys.forEach((key) => delete gameConfig[key]);
    const outputFileName = "game.json";
    const gameConfigSaveString = JSON.stringify(gameConfig, null, 2);
    saveLocalFile(this.pathInfo.outputResolve(outputFileName), gameConfigSaveString, { force: true });
    printLog(` Completed  (${gameConfigSaveString.length}) 	` + colors.bold(colors.gray(this.pathInfo.outputResolve(outputFileName))));
    printLog(` ▶ 反编译 ${outputFileName} 文件成功. 
`, { isStart: true });
  }
  /**
   * 反编译小游戏的js文件
   * */
  async decompileGameJS() {
    const _this = this;
    let cont = 0;
    const evalCodeList = [
      this.codeInfo.subContextJs,
      this.codeInfo.gameJs
    ].filter(Boolean);
    const allJsList = [];
    const sandbox = {
      define(name, func) {
        allJsList.push(name);
        _this._parseJsDefine(name, func);
        cont++;
      },
      require() {
      }
    };
    evalCodeList.forEach((code) => {
      const vm = createVM({ sandbox });
      if (!code.includes("define(") || !code.includes("function(require, module, exports)")) return;
      try {
        runVmCode(vm, code);
      } catch (e) {
        console.error(e.message);
      }
    });
    if (cont) {
      printLog(` ▶ 反编译所有 js 文件成功. 
`);
    }
  }
  async decompileAll() {
    super.decompileAll();
    await this.initGame();
    await this.decompileGameJSON();
    await this.decompileGameJS();
    await this.decompileAppWorkers();
  }
}
function parseParenthesesTyping(str) {
  str = str.trim();
  const sameObject = str.startsWith("{") && str.endsWith("}");
  const sameArray = str.startsWith("[") && str.endsWith("]");
  const hasSpreading = (sameArray || sameObject) && str.includes("...");
  if (sameObject && !hasSpreading && str.split(":").length === 2) {
    return "single";
  } else if (sameObject || sameArray) {
    return "multiple";
  } else {
    return "double";
  }
}
function restoreSingle(ops, withScope = false) {
  if (typeof ops == "undefined") return "";
  function scope(value) {
    if (withScope) return value;
    if (value.startsWith("{") && value.endsWith("}")) return "{{(" + value + ")}}";
    if (value.startsWith("...")) return "{" + value.substring(3) + "}";
    return "{{" + value + "}}";
  }
  function enBrace(value, type = "{") {
    if (value.startsWith("{") || value.startsWith("[") || value.startsWith("(") || value.endsWith("}") || value.endsWith("]") || value.endsWith(")")) {
      value = " " + value + " ";
    }
    switch (type) {
      case "{":
        return "{" + value + "}";
      case "[":
        return "[" + value + "]";
      case "(":
        return "(" + value + ")";
      default:
        throw Error("Unknown brace type " + type);
    }
  }
  function restoreNext(ops2, w = withScope) {
    return restoreSingle(ops2, w);
  }
  function jsoToWxOn(obj) {
    let ans = "";
    if (typeof obj === "undefined") {
      return "undefined";
    } else if (obj === null) {
      return "null";
    } else if (obj instanceof RegExp) {
      return obj.toString();
    } else if (obj instanceof Array) {
      for (let i = 0; i < obj.length; i++) ans += "," + jsoToWxOn(obj[i]);
      return enBrace(ans.slice(1), "[");
    } else if (typeof obj == "object") {
      for (let k in obj) ans += "," + k + ":" + jsoToWxOn(obj[k]);
      return enBrace(ans.slice(1), "{");
    } else if (typeof obj == "string") {
      let parts = obj.split('"'), ret = [];
      for (let part of parts) {
        let atoms = part.split("'"), ans2 = [];
        for (let atom of atoms) ans2.push(JSON.stringify(atom).slice(1, -1));
        ret.push(ans2.join("\\'"));
      }
      return "'" + ret.join('"') + "'";
    } else return JSON.stringify(obj);
  }
  let op = ops[0];
  if (!Array.isArray(op)) {
    switch (op) {
      case 3:
        return ops[1];
      case 1:
        const val = jsoToWxOn(ops[1]);
        return scope(val);
      case 11:
        let ans = "";
        ops.shift();
        for (let perOp of ops) ans += restoreNext(perOp);
        return ans;
    }
  } else {
    let ans = "";
    switch (op[0]) {
      case 2: {
        let getPrior = function(op2, len) {
          const priorList = {
            "?:": 4,
            "&&": 6,
            "||": 5,
            "+": 13,
            "*": 14,
            "/": 14,
            "%": 14,
            "|": 7,
            "^": 8,
            "&": 9,
            "!": 16,
            "~": 16,
            "===": 10,
            "==": 10,
            "!=": 10,
            "!==": 10,
            ">=": 11,
            "<=": 11,
            ">": 11,
            "<": 11,
            "<<": 12,
            ">>": 12,
            "-": len === 3 ? 13 : 16
          };
          return priorList[op2] ? priorList[op2] : 0;
        }, getOp = function(i) {
          let ret = restoreNext(ops[i], true);
          if (ops[i] instanceof Object && typeof ops[i][0] == "object" && ops[i][0][0] === 2) {
            if (getPrior(op[1], ops.length) > getPrior(ops[i][0][1], ops[i].length)) ret = enBrace(ret, "(");
          }
          return ret;
        };
        switch (op[1]) {
          case "?:":
            ans = getOp(1) + "?" + getOp(2) + ":" + getOp(3);
            break;
          case "!":
          case "~":
            ans = op[1] + getOp(1);
            break;
          case "-":
            if (ops.length !== 3) {
              ans = op[1] + getOp(1);
              break;
            }
          default:
            ans = getOp(1) + op[1] + getOp(2);
        }
        break;
      }
      case 4:
        ans = restoreNext(ops[1], true);
        break;
      case 5: {
        switch (ops.length) {
          case 2:
            ans = enBrace(restoreNext(ops[1], true), "[");
            break;
          case 1:
            ans = "[]";
            break;
          default: {
            let a = restoreNext(ops[1], true);
            if (a.startsWith("[") && a.endsWith("]")) {
              if (a !== "[]") {
                ans = enBrace(a.slice(1, -1).trim() + "," + restoreNext(ops[2], true), "[");
              } else {
                ans = enBrace(restoreNext(ops[2], true), "[");
              }
            } else {
              ans = enBrace("..." + a + "," + restoreNext(ops[2], true), "[");
            }
          }
        }
        break;
      }
      case 6: {
        let sonName = restoreNext(ops[2], true);
        if (sonName._type === "var") {
          ans = restoreNext(ops[1], true) + enBrace(sonName, "[");
        } else {
          let attach = "";
          if (/^[A-Za-z\_][A-Za-z\d\_]*$/.test(sonName))
            attach = "." + sonName;
          else attach = enBrace(sonName, "[");
          ans = restoreNext(ops[1], true) + attach;
        }
        break;
      }
      case 7: {
        switch (ops[1][0]) {
          case 11:
            ans = enBrace("__unTestedGetValue:" + enBrace(jsoToWxOn(ops), "["), "{");
            break;
          case 3:
            ans = new String(ops[1][1]);
            ans["_type"] = "var";
            break;
          default:
            throw Error("Unknown type to get value");
        }
        break;
      }
      case 8:
        ans = enBrace(ops[1] + ":" + restoreNext(ops[2], true), "{");
        break;
      case 9: {
        let type = function(x) {
          if (x.startsWith("...")) return 1;
          if (x.startsWith("{") && x.endsWith("}")) return 0;
          return 2;
        };
        let a = restoreNext(ops[1], true);
        let b = restoreNext(ops[2], true);
        let xa = type(a), xb = type(b);
        if (xa == 2 || xb == 2) ans = enBrace("__unkownMerge:" + enBrace(a + "," + b, "["), "{");
        else {
          if (!xa) a = a.slice(1, -1).trim();
          if (!xb) b = b.slice(1, -1).trim();
          ans = enBrace(a + "," + b, "{");
        }
        break;
      }
      case 10:
        ans = "..." + restoreNext(ops[1], true);
        break;
      case 12: {
        let arr = restoreNext(ops[2], true);
        if (arr.startsWith("[") && arr.endsWith("]"))
          ans = restoreNext(ops[1], true) + enBrace(arr.slice(1, -1).trim(), "(");
        else ans = restoreNext(ops[1], true) + ".apply" + enBrace("null," + arr, "(");
        break;
      }
      default:
        ans = enBrace("__unkownSpecific:" + jsoToWxOn(ops), "{");
    }
    return scope(ans);
  }
}
function catchZ(code, cb) {
  const reg = /function\s+gz\$gwx(\w+)\(\)\{(?:.|\n)*?;return\s+__WXML_GLOBAL__\.ops_cached\.\$gwx[\w\n]+}/g;
  const allGwxFunctionMatch = code.match(reg);
  if (!allGwxFunctionMatch) return;
  const allFunctionMap = {};
  const zObject = {};
  const vm = createVM({
    sandbox: { __WXML_GLOBAL__: { ops_cached: {} } }
  });
  allGwxFunctionMatch.forEach((funcString) => {
    var _a;
    const funcReg = /function\s+gz\$gwx(\w*)\(\)/g;
    const funcName = (_a = funcReg.exec(funcString)) == null ? void 0 : _a[1];
    if (!funcName) return;
    vm.run(funcString);
    const hookZFunc = vm.sandbox[`gz$gwx${funcName}`];
    if (hookZFunc) {
      allFunctionMap[funcName] = hookZFunc;
      zObject[funcName] = hookZFunc();
      zObject[funcName] = zObject[funcName].map((data) => {
        if (Array.isArray(data) && data[0] === "11182016" && Array.isArray(data[1])) return data[1];
        return data;
      });
    }
  });
  cb(zObject);
}
function getZ(code, cb) {
  catchZ(code, (z) => {
    let ans = {};
    for (let gwxFuncName in z) {
      ans[gwxFuncName] = z[gwxFuncName].map((gwxData) => restoreSingle(gwxData, false));
    }
    cb(ans);
  });
}
function analyze(core, z, namePool, xPool, fakePool = {}, zMulName = "0") {
  function anaRecursion(core2, fakePool2 = {}) {
    return analyze(core2, z, namePool, xPool, fakePool2, zMulName);
  }
  function push(name, elem) {
    namePool[name] = elem;
  }
  function pushSon(pname, son) {
    if (fakePool[pname]) fakePool[pname].son.push(son);
    else namePool[pname].son.push(son);
  }
  for (let ei = 0; ei < core.length; ei++) {
    let e = core[ei];
    switch (e.type) {
      case "ExpressionStatement": {
        let f = e.expression;
        if (f.callee) {
          if (f.callee.type == "Identifier") {
            switch (f.callee.name) {
              case "_r":
                namePool[f.arguments[0].name].v[f.arguments[1].value] = z[f.arguments[2].value];
                break;
              case "_rz":
                namePool[f.arguments[1].name].v[f.arguments[2].value] = z[zMulName][f.arguments[3].value];
                break;
              case "_":
                pushSon(f.arguments[0].name, namePool[f.arguments[1].name]);
                break;
              case "_2":
                {
                  let item = f.arguments[6].value;
                  let index = f.arguments[7].value;
                  let data = z[f.arguments[0].value];
                  let key = escodegen.generate(f.arguments[8]).slice(1, -1);
                  let obj = namePool[f.arguments[5].name];
                  let gen = namePool[f.arguments[1].name];
                  if (gen.tag == "gen") {
                    let ret = gen.func.body.body.pop().argument.name;
                    anaRecursion(gen.func.body.body, { [ret]: obj });
                  }
                  obj.v["wx:for"] = data;
                  if (index != "index") obj.v["wx:for-index"] = index;
                  if (item != "item") obj.v["wx:for-item"] = item;
                  if (key != "") obj.v["wx:key"] = key;
                }
                break;
              case "_2z":
                {
                  let item = f.arguments[7].value;
                  let index = f.arguments[8].value;
                  let data = z[zMulName][f.arguments[1].value];
                  let key = escodegen.generate(f.arguments[9]).slice(1, -1);
                  let obj = namePool[f.arguments[6].name];
                  let gen = namePool[f.arguments[2].name];
                  if (gen.tag == "gen") {
                    let ret = gen.func.body.body.pop().argument.name;
                    anaRecursion(gen.func.body.body, { [ret]: obj });
                  }
                  obj.v["wx:for"] = data;
                  if (index != "index") obj.v["wx:for-index"] = index;
                  if (item != "item") obj.v["wx:for-item"] = item;
                  if (key != "") obj.v["wx:key"] = key;
                }
                break;
              case "_ic":
                pushSon(f.arguments[5].name, {
                  tag: "include",
                  son: [],
                  v: { src: xPool[f.arguments[0].property.value] }
                });
                break;
              case "_ai":
                {
                  let to = Object.keys(fakePool)[0];
                  if (to) pushSon(to, {
                    tag: "import",
                    son: [],
                    v: { src: xPool[f.arguments[1].property.value] }
                  });
                  else throw Error("Unexpected fake pool");
                }
                break;
              case "_af":
                break;
              default:
                throw Error("Unknown expression callee name " + f.callee.name);
            }
          } else if (f.callee.type == "MemberExpression") {
            if (f.callee.object.name == "cs" || f.callee.property.name == "pop") break;
            throw Error("Unknown member expression");
          } else throw Error("Unknown callee type " + f.callee.type);
        } else if (f.type == "AssignmentExpression" && f.operator == "=") {
        } else throw Error("Unknown expression statement.");
        break;
      }
      case "VariableDeclaration":
        for (let dec of e.declarations) {
          if (dec.init.type == "CallExpression") {
            switch (dec.init.callee.name) {
              case "_n":
                let tagName = dec.init.arguments[0].value;
                if (["wx-scope"].includes(tagName)) {
                  tagName = "view";
                }
                push(dec.id.name, { tag: tagName, son: [], v: {} });
                break;
              case "_v":
                push(dec.id.name, { tag: "block", son: [], v: {} });
                break;
              case "_o":
                push(dec.id.name, {
                  tag: "__textNode__",
                  textNode: true,
                  content: z[dec.init.arguments[0].value]
                });
                break;
              case "_oz":
                push(dec.id.name, {
                  tag: "__textNode__",
                  textNode: true,
                  content: z[zMulName][dec.init.arguments[1].value]
                });
                break;
              case "_m":
                {
                  if (dec.init.arguments[2].elements.length > 0) {
                    throw Error("Noticable generics content: " + dec.init.arguments[2].toString());
                  }
                  let mv = {};
                  let name = null, base = 0;
                  for (let x of dec.init.arguments[1].elements) {
                    let v = x.value;
                    if (!v && typeof v != "number") {
                      if (x.type == "UnaryExpression" && x.operator == "-") v = -x.argument.value;
                      else throw Error("Unknown type of object in _m attrs array: " + x.type);
                    }
                    if (name === null) {
                      name = v;
                    } else {
                      if (base + v < 0) mv[name] = null;
                      else {
                        mv[name] = z[base + v];
                        if (base == 0) base = v;
                      }
                      name = null;
                    }
                  }
                  push(dec.id.name, { tag: dec.init.arguments[0].value, son: [], v: mv });
                }
                break;
              case "_mz":
                {
                  if (dec.init.arguments[3].elements.length > 0) {
                    throw Error("Noticable generics content: " + dec.init.arguments[3].toString());
                  }
                  let mv = {};
                  let name = null, base = 0;
                  for (let x of dec.init.arguments[2].elements) {
                    let v = x.value;
                    if (!v && typeof v != "number") {
                      if (x.type == "UnaryExpression" && x.operator == "-") v = -x.argument.value;
                      else throw Error("Unknown type of object in _mz attrs array: " + x.type);
                    }
                    if (name === null) {
                      name = v;
                    } else {
                      if (base + v < 0) mv[name] = null;
                      else {
                        mv[name] = z[zMulName][base + v];
                        if (base == 0) base = v;
                      }
                      name = null;
                    }
                  }
                  push(dec.id.name, { tag: dec.init.arguments[1].value, son: [], v: mv });
                }
                break;
              case "_gd":
                {
                  let is = namePool[dec.init.arguments[1].name].content;
                  let data = null, obj = null;
                  ei++;
                  for (let e2 of core[ei].consequent.body) {
                    if (e2.type == "VariableDeclaration") {
                      for (let f of e2.declarations) {
                        if (f.init.type == "LogicalExpression" && f.init.left.type == "CallExpression") {
                          if (f.init.left.callee.name == "_1") data = z[f.init.left.arguments[0].value];
                          else if (f.init.left.callee.name == "_1z") data = z[zMulName][f.init.left.arguments[1].value];
                          if (data.startsWith("{{({") && data.endsWith("})}}")) {
                            data = `{{${data.substring(4, data.length - 4)}}}`;
                          }
                        }
                      }
                    } else if (e2.type == "ExpressionStatement") {
                      let f = e2.expression;
                      if (f.type == "AssignmentExpression" && f.operator == "=" && f.left.property && f.left.property.name == "wxXCkey") {
                        obj = f.left.object.name;
                      }
                    }
                  }
                  namePool[obj].tag = "template";
                  Object.assign(namePool[obj].v, { is, data });
                }
                break;
              default: {
                let funName = dec.init.callee.name;
                if (funName.startsWith("gz$gwx")) {
                  zMulName = funName.slice(6);
                } else throw Error("Unknown init callee " + funName);
              }
            }
          } else if (dec.init.type == "FunctionExpression") {
            push(dec.id.name, { tag: "gen", func: dec.init });
          } else if (dec.init.type == "MemberExpression") {
            if (dec.init.object.type == "MemberExpression" && dec.init.object.object.name == "e_" && dec.init.object.property.type == "MemberExpression" && dec.init.object.property.object.name == "x") {
              if (dec.init.property.name == "j") {
              } else if (dec.init.property.name == "i") {
              } else throw Error("Unknown member expression declaration.");
            } else throw Error("Unknown member expression declaration.");
          } else throw Error("Unknown declaration init type " + dec.init.type);
        }
        break;
      case "IfStatement":
        if (e.test.callee.name.startsWith("_o")) {
          let parse_OFun = function(e2) {
            if (e2.test.callee.name == "_o") return z[e2.test.arguments[0].value];
            else if (e2.test.callee.name == "_oz") return z[zMulName][e2.test.arguments[1].value];
            else throw Error("Unknown if statement test callee name:" + e2.test.callee.name);
          };
          let vname = e.consequent.body[0].expression.left.object.name;
          let nif = { tag: "block", v: { "wx:if": parse_OFun(e) }, son: [] };
          anaRecursion(e.consequent.body, { [vname]: nif });
          pushSon(vname, nif);
          if (e.alternate) {
            while (e.alternate && e.alternate.type == "IfStatement") {
              e = e.alternate;
              nif = { tag: "block", v: { "wx:elif": parse_OFun(e) }, son: [] };
              anaRecursion(e.consequent.body, { [vname]: nif });
              pushSon(vname, nif);
            }
            if (e.alternate && e.alternate.type == "BlockStatement") {
              e = e.alternate;
              nif = { tag: "block", v: { "wx:else": null }, son: [] };
              anaRecursion(e.body, { [vname]: nif });
              pushSon(vname, nif);
            }
          }
        } else {
          throw Error("Unknown if statement.");
        }
        break;
      default:
        throw Error("Unknown type " + e.type);
    }
  }
}
function wxmlify(str, isText) {
  if (typeof str == "undefined" || str === null) return "Empty";
  if (isText) return str;
  else return str.replace(/"/g, '\\"');
}
function elemToString(elem, dep) {
  const longerList = [];
  const indent = " ".repeat(4);
  function isTextTag(elem2) {
    return elem2.tag == "__textNode__" && elem2.textNode;
  }
  function elemRecursion(elem2, dep2) {
    return elemToString(elem2, dep2);
  }
  function trimMerge(rets2) {
    let needTrimLeft = false, ans = "";
    for (let ret2 of rets2) {
      if (ret2.textNode == 1) {
        if (!needTrimLeft) {
          needTrimLeft = true;
          ans = ans.trimEnd();
        }
      } else if (needTrimLeft) {
        needTrimLeft = false;
        ret2 = ret2.trimStart();
      }
      ans += ret2;
    }
    return ans;
  }
  if (isTextTag(elem)) {
    const StringC = String;
    String();
    let str = new StringC(wxmlify(elem.content, true));
    str["textNode"] = 1;
    return wxmlify(str, true);
  }
  if (elem.tag == "block") {
    if (elem.son.length == 1 && !isTextTag(elem.son[0])) {
      let ok = true, s = elem.son[0];
      for (let x in elem.v) if (x in s.v) {
        ok = false;
        break;
      }
      if (ok && !(("wx:for" in s.v || "wx:if" in s.v) && ("wx:if" in elem.v || "wx:else" in elem.v || "wx:elif" in elem.v))) {
        Object.assign(s.v, elem.v);
        return elemRecursion(s, dep);
      }
    } else if (Object.keys(elem.v).length == 0) {
      let ret2 = [];
      for (let s of elem.son) ret2.push(elemRecursion(s, dep));
      return trimMerge(ret2);
    }
  }
  let ret = indent.repeat(dep) + "<" + elem.tag;
  for (let attr in elem.v) {
    if (attr.toString().trim().startsWith("wx:") && typeof elem.v[attr] == "string") {
      if (elem.v[attr].startsWith("{{({") && elem.v[attr].endsWith("})}}")) {
        const data = elem.v[attr].slice(4, elem.v[attr].length - 4);
        if (!data.includes(",") && data.split(":").length == 2) {
          elem.v[attr] = `{{${data}}}`;
        }
      }
    }
    ret += " " + attr + (elem.v[attr] !== null ? '="' + wxmlify(elem.v[attr]) + '"' : "");
  }
  if (elem.son.length == 0) {
    if (longerList.includes(elem.tag)) return ret + " />\n";
    else return ret + "></" + elem.tag + ">\n";
  }
  ret += ">\n";
  let rets = [ret];
  for (let s of elem.son) rets.push(elemRecursion(s, dep + 1));
  rets.push(indent.repeat(dep) + "</" + elem.tag + ">\n");
  return trimMerge(rets);
}
function genReferenceTemplate(z, defineRef) {
  const state = [];
  const result = [];
  for (let v in defineRef) {
    state[0] = v;
    let oriCode = defineRef[v].toString();
    let rName = oriCode.slice(oriCode.lastIndexOf("return") + 6).replace(/[;}]/g, "").trim();
    let tryPtr = oriCode.indexOf("\ntry{");
    let zPtr = oriCode.indexOf("var z=gz$gwx");
    let code = oriCode.slice(tryPtr + 5, oriCode.lastIndexOf("\n}catch(")).trim();
    if (zPtr != -1 && tryPtr > zPtr) {
      let attach = oriCode.slice(zPtr);
      attach = attach.slice(0, attach.indexOf("()")) + "()\n";
      code = attach + code;
    }
    let r = { tag: "template", v: { name: v }, son: [] };
    analyze(esprima.parseScript(code).body, z, { [rName]: r }, { [rName]: r });
    result.push(elemToString(r, 0));
  }
  return result.join("");
}
function getDecompiledWxml(code, z, xPool) {
  let rName = code.slice(code.lastIndexOf("return") + 6).replace(/[;}]/g, "").trim();
  code = code.slice(code.indexOf("\n"), code.lastIndexOf("return")).trim();
  let r = { son: [] };
  const namePool = { [rName]: r };
  const fakePool = { [rName]: r };
  analyze(esprima.parseScript(code).body, z, namePool, xPool, fakePool);
  let ans = [];
  for (let elem of r.son) ans.push(elemToString(elem, 0));
  return ans.join("");
}
function tryDecompileWxml(f_func_code, z, define, xPool) {
  try {
    return getDecompiledWxml(f_func_code, z, xPool) + genReferenceTemplate(z, define);
  } catch (e) {
    console.error("[tryDecompileWxml]", e.message);
    return "";
  }
}
class AppDecompilation extends BaseDecompilation {
  codeInfo;
  runtimeCodeCache = {};
  /**
   * 是否将第三方的远程插件转换变成本地离线使用
   * */
  convertPlugin = false;
  /**
   * 包的配置
   * */
  appConfig = {};
  /**
   * 主包所有入口 ( 不包含分包 )
   * */
  mainPackEntries = [];
  /**
   * 所有在 page.json 中被引用的组件
   * */
  constructor(packInfo) {
    super(packInfo);
  }
  /**
   * 初始化, 所有后续反编译且不会被动态改变的所需要的信息都在这里加载
   * */
  async initApp() {
    this.codeInfo = getAppPackCodeInfo(this.pathInfo);
    this.appConfig = JSON.parse(readLocalFile(this.pathInfo.outputResolve(this.pathInfo.appJsonPath)) || "{}");
    const loadInfo = {};
    for (const name in this.codeInfo) {
      loadInfo[name] = this.codeInfo[name].length;
    }
    console.log(loadInfo);
    const code = this.getRuntimeCode("style") || this.getRuntimeCode("gwx");
    if (!code) {
      if (this.packType === "main") {
        console.log(colors.red("❌  没有找到包特征文件"));
      }
      return;
    }
  }
  getRuntimeCodeCandidates() {
    return [
      { name: "appWxss", code: this.codeInfo.appWxss },
      { name: "pageFrame", code: this.codeInfo.pageFrame },
      { name: "pageFrameHtml", code: this.codeInfo.pageFrameHtml }
    ].filter((item) => {
      var _a;
      return (_a = item.code) == null ? void 0 : _a.trim();
    });
  }
  getRuntimeCode(type) {
    const cachedCode = this.runtimeCodeCache[type];
    if (typeof cachedCode === "string") {
      return cachedCode;
    }
    const candidates = this.getRuntimeCodeCandidates();
    if (!candidates.length) {
      this.runtimeCodeCache[type] = "";
      return "";
    }
    let selected = candidates[0];
    if (type === "style") {
      selected = candidates.find((item) => this.isStyleRuntimeCode(item.code)) || candidates[0];
    } else {
      selected = candidates.find((item) => this.canResolveGwxRuntimeCode(item.code)) || candidates[0];
    }
    this.runtimeCodeCache[type] = selected.code;
    return selected.code;
  }
  isStyleRuntimeCode(code) {
    return code.includes("setCssToHead") || code.includes("__COMMON_STYLESHEETS__") || code.includes(".wxss");
  }
  canResolveGwxRuntimeCode(code) {
    if (!code.includes("$gwx") && !code.includes(".wxml")) {
      return false;
    }
    const { ALL_ENTRYS, ALL_DEFINES } = this.executeAllGwxFunction(code);
    return Boolean(
      Object.keys(ALL_ENTRYS).length || Object.keys(ALL_DEFINES).length
    );
  }
  /**
   * 解析出 app.json 文件， 只有主包需要处理
   * */
  async decompileAppJSON() {
    var _a, _b;
    if (this.packType !== "main") return;
    await sleep(200);
    const appConfig = JSON.parse(this.codeInfo.appConfigJson);
    Object.assign(appConfig, appConfig.global);
    delete appConfig.global;
    delete appConfig.page;
    if (appConfig.entryPagePath) appConfig.entryPagePath = appConfig.entryPagePath.replace(".html", "");
    if (appConfig.renderer) {
      appConfig.renderer = appConfig.renderer.default || "webview";
    }
    if (appConfig.extAppid) {
      saveLocalFile(this.pathInfo.outputResolve("ext.json"), JSON.stringify({
        extEnable: true,
        extAppid: appConfig.extAppid,
        ext: appConfig.ext
      }, null, 2));
    }
    if (this.codeInfo.appConfigJson.includes('"renderer": "skyline"') || this.codeInfo.appConfigJson.includes('"renderer":"skyline"')) {
      appConfig.lazyCodeLoading = "requiredComponents";
      delete appConfig.window["navigationStyle"];
      delete appConfig.window["navigationBarTextStyle"];
      delete appConfig.window["navigationBarTitleText"];
      delete appConfig.window["navigationBarBackgroundColor"];
    }
    this.mainPackEntries = arrayDeduplication([...appConfig.pages]);
    if (appConfig.subPackages) {
      let subPackages = [];
      appConfig.subPackages.forEach((subPackage) => {
        let root = subPackage.root;
        let newPages = [];
        root = !String(root).endsWith("/") ? root + "/" : root;
        root = String(root).startsWith("/") ? root.substring(1) : root;
        subPackage.root = root;
        if (Array.isArray(appConfig.pages)) {
          for (let pageString of appConfig.pages) {
            if (pageString.startsWith(root)) {
              removeElement(this.mainPackEntries, pageString);
              newPages.push(pageString.replace(root, ""));
            }
          }
          subPackage.pages = arrayDeduplication(newPages);
        }
        if (subPackage.plugins) {
          subPackage.plugins = {};
        }
        subPackages.push(subPackage);
      });
      subPackages = subPackages.filter((sub) => (sub.pages || []).length > 0);
      delete appConfig.subPackages;
      appConfig.subPackages = subPackages;
    }
    if (appConfig.pages) {
      appConfig.pages = /*必须在subPackages 之后*/
      this.mainPackEntries;
    }
    if (appConfig.tabBar) {
      if (!appConfig.tabBar.list) appConfig.tabBar.list = [];
      const allDecompilationBeforeFileList = glob.globSync(`${this.pathInfo.outputPath}/**`);
      const allFileBufferInfo = allDecompilationBeforeFileList.filter((filePath) => !fs.statSync(filePath).isDirectory()).map((filePath) => {
        return {
          data: readLocalFile(filePath, "base64"),
          path: filePath
        };
      });
      appConfig.tabBar.list = appConfig.tabBar.list.map((info) => {
        const result = { text: info.text };
        result.pagePath = info.pagePath.replace(".html", "");
        if (info.iconData) {
          const found = allFileBufferInfo.find((item) => item.data === info.iconData);
          if (found) result.iconPath = path.relative(this.pathInfo.outputPath, found.path).split(path.sep).join("/");
        }
        if (info.selectedIconData) {
          const found = allFileBufferInfo.find((item) => item.data === info.selectedIconData);
          if (found) result.selectedIconPath = path.relative(this.pathInfo.outputPath, found.path).split(path.sep).join("/");
        }
        return result;
      });
    }
    if (this.convertPlugin) {
      appConfig.plugins = {};
    }
    if (appConfig.componentFramework) {
      appConfig.componentFramework = ((_a = appConfig.componentFramework) == null ? void 0 : _a.default) || ((_b = appConfig.componentFramework.allUsed) == null ? void 0 : _b[0]) || appConfig.componentFramework;
    }
    delete appConfig.ext;
    appJsonExcludeKeys.forEach((key) => delete appConfig[key]);
    const outputFileName = "app.json";
    const appConfigSaveString = JSON.stringify(appConfig, null, 2).replaceAll(pluginDirRename[0], pluginDirRename[1]);
    saveLocalFile(this.pathInfo.outputResolve(outputFileName), appConfigSaveString, { force: true });
    printLog(` Completed  (${appConfigSaveString.length}) 	` + colors.bold(colors.gray(this.pathInfo.outputResolve(outputFileName))));
    printLog(` ▶ 反编译 ${outputFileName} 文件成功. 
`, { isStart: true });
  }
  /**
   * 处理子包 json，只需要处理主包， 子包解压自带 json
   * */
  async decompileAllJSON() {
    var _a;
    const plugins = {};
    const vm = createVM({
      sandbox: {
        definePlugin: function(pluginName, pluginFunc) {
          plugins[pluginName] = pluginFunc;
        }
      }
    });
    runVmCode(vm, this.codeInfo.appService);
    this._injectPluginAppPageJSON(vm, plugins);
    const __wxAppCode__ = Object.assign(vm.sandbox.__wxAppCode__, ((_a = vm.sandbox.global) == null ? void 0 : _a.__wxAppCode__) || {});
    for (const filePath in __wxAppCode__) {
      if (path.extname(filePath) !== ".json") continue;
      let tempFilePath = filePath;
      let dir = path.dirname(filePath);
      const pageJson = __wxAppCode__[filePath];
      const { componentPlaceholder, usingComponents } = pageJson;
      if (componentPlaceholder) {
        Object.keys(componentPlaceholder).forEach((name) => componentPlaceholder[name] = "view");
      }
      for (const key in usingComponents) {
        if (usingComponents[key].startsWith("/./")) {
          usingComponents[key] = usingComponents[key].substring(3);
        }
        if (!isPluginPath(usingComponents[key])) {
          usingComponents[key] = path.relative(dir, path.join(dir, usingComponents[key])).split(path.sep).join("/");
        }
      }
      let realJsonConfigString = JSON.stringify(pageJson, null, 2);
      let jsonOutputPath = filePath;
      if (isPluginPath(filePath)) {
        tempFilePath = path.join(pluginDirRename[0], filePath.replace("plugin-private://", ""));
        jsonOutputPath = path.join(this.pathInfo.packRootPath, tempFilePath);
      }
      printLog(` Completed  (${realJsonConfigString.length}) 	` + colors.bold(colors.gray(jsonOutputPath)));
      saveLocalFile(this.pathInfo.outputResolve(jsonOutputPath), realJsonConfigString, { force: true });
    }
    printLog(` ▶ 反编译所有 page json 文件成功. 
`, { isStart: true });
  }
  /**
   * 将 json 信息注入沙箱 __wxAppCode__ 中
   * */
  _injectPluginAppPageJSON(vm, plugins) {
    const sandBox = vm.sandbox;
    for (const pluginName in plugins) {
      const global = {
        __wxAppCode__: {},
        publishDomainComponents() {
        }
      };
      const pluginFunc = plugins[pluginName];
      const paramNameList = getParameterNames(pluginFunc);
      const paramValueList = paramNameList.map((name) => {
        if (name === "global") return global;
        return sandBox[name] || sandBox.window[name];
      });
      pluginFunc.apply(sandBox.window, paramValueList);
      Object.assign(sandBox.__wxAppCode__, global.__wxAppCode__);
    }
  }
  async decompileAppJS() {
    const _this = this;
    const plugins = {};
    const sandbox = {
      require() {
      },
      define(name, func) {
        _this._parseJsDefine(name, func);
      },
      definePlugin: function(pluginName, pluginFunc) {
        plugins[pluginName] = pluginFunc;
      }
    };
    let appServiceCode = this.codeInfo.appService;
    if (appServiceCode) {
      const vm = createVM();
      Object.assign(vm.sandbox, sandbox);
      appServiceCode = appServiceCode.replaceAll("=__webnode__.define;", ";").replaceAll("=__webnode__.require;", ";");
      runVmCode(vm, appServiceCode);
      Object.assign(vm.sandbox, sandbox);
      this._decompilePluginAppJS(vm, plugins);
      printLog(` ▶ 反编译所有 js 文件成功. 
`, { isStart: true });
    }
  }
  /**
   * 反编译插件 JS 代码
   * */
  _decompilePluginAppJS(vm, plugins) {
    const sandBox = vm.sandbox;
    const mainEnvDefine = sandBox.define;
    const _this = this;
    sandBox.global = sandBox.window;
    let pluginDefine;
    for (const pluginName in plugins) {
      const appid = pluginName.replace("plugin://", "");
      pluginDefine = function(name, func) {
        const pluginPath = path.relative(
          _this.pathInfo.outputPath,
          _this.pathInfo.resolve(`${pluginDirRename[0]}/${appid}/${name}`)
        );
        mainEnvDefine(pluginPath, func);
      };
      const pluginFunc = plugins[pluginName];
      const paramNameList = getParameterNames(pluginFunc);
      const paramValueList = paramNameList.map((name) => {
        if (name === "define") return pluginDefine;
        return sandBox[name] || sandBox.window[name] || sandBox.window.document[name];
      });
      pluginFunc.apply(sandBox.window, paramValueList);
    }
  }
  _setCssToHead(arr, _invalid, opt) {
    if (typeof opt === "object" && opt.path && Array.isArray(arr)) {
      let cssPath = opt.path;
      const isPlugin = isPluginPath(cssPath);
      if (isPlugin) {
        cssPath = resetPluginPath(cssPath, path.join(this.pathInfo.packRootPath, pluginDirRename[0]));
      }
      arr = arr.map((item) => {
        if (Array.isArray(item)) {
          const type = item[0];
          if (type === 0) {
            return typeof item[1] === "number" ? `${item[1]}rpx` : "";
          } else if (type === 2) {
            if (typeof item[1] === "string") {
              const relativePath = path.relative(
                this.pathInfo.outputResolve(path.dirname(cssPath)),
                this.pathInfo.resolve(item[1])
              );
              return `@import "${relativePath}";`;
            }
            return "";
          } else if (type === 1) {
            return opt.suffix || "";
          } else {
            return item[1];
          }
        }
        return item;
      });
      let cssText = arr.join("");
      cssText = cssText.replace(cssBodyToPageReg, "page{");
      saveLocalFile(this.pathInfo.outputResolve(cssPath), cssbeautify(cssText));
    }
    return () => void 0;
  }
  async decompileAppWXSSWithRpx() {
    const globalSetMatchReg = /setCssToHead\(.+?}\)\(\)/g;
    let code = this.getRuntimeCode("style");
    code = code.replaceAll("return rewritor;", "return ()=> ({file, info});");
    code = code.replaceAll("__COMMON_STYLESHEETS__[", "__COMMON_STYLESHEETS_HOOK__[");
    code = code.replaceAll(";__wxAppCode__", ";\n__wxAppCode__");
    const vm = createVM({
      sandbox: { __COMMON_STYLESHEETS_HOOK__: {} }
    });
    runVmCode(vm, code);
    let lastMatch = null;
    do {
      lastMatch = globalSetMatchReg.exec(code);
      if (!lastMatch) break;
      const cssSeedCode = lastMatch[0];
      try {
        const func = new Function("setCssToHead", cssSeedCode);
        func(this._setCssToHead.bind(this));
      } catch (e) {
        console.error(e.message);
      }
    } while (lastMatch);
    const __wxAppCode__ = vm.sandbox["__wxAppCode__"];
    for (let cssPath in __wxAppCode__) {
      if (path.extname(cssPath) !== ".wxss") continue;
      const { file: astList, info = {} } = __wxAppCode__[cssPath]();
      this._setCssToHead(astList, null, { path: cssPath, suffix: info.suffix });
    }
    const __COMMON_STYLESHEETS_HOOK__ = vm.sandbox.__COMMON_STYLESHEETS_HOOK__ || {};
    for (let cssPath in __COMMON_STYLESHEETS_HOOK__) {
      const astList = __COMMON_STYLESHEETS_HOOK__[cssPath];
      cssPath = path.join(this.pathInfo.packRootPath, cssPath);
      this._setCssToHead(astList, null, { path: cssPath });
    }
  }
  /**
   * 反编译包中的 wxss 文件
   * */
  async decompileAppWXSS() {
    let code = this.getRuntimeCode("style");
    if (!code.trim()) return;
    const vm = createVM();
    runVmCode(vm, code);
    const __wxAppCode__ = vm.sandbox["__wxAppCode__"];
    if (!__wxAppCode__) return;
    const children = vm.sandbox.window.document.head.children || [];
    const mainPackageRenderedNodes = Array.from(children);
    for (let filepath in __wxAppCode__) {
      if (path.extname(filepath) !== ".wxss") continue;
      __wxAppCode__[filepath]();
      const lastStyleEl = children[children.length - 1];
      const attr_wxss_path = lastStyleEl.getAttribute("wxss:path");
      if (!attr_wxss_path) continue;
      if (isPluginPath(filepath)) {
        filepath = resetPluginPath(filepath, path.join(this.pathInfo.packRootPath, pluginDirRename[0]));
        lastStyleEl.setAttribute("wxss:path", filepath);
      }
    }
    Array.from(children).forEach((styleEl) => {
      if (this.packType !== "main") {
        if (mainPackageRenderedNodes.includes(styleEl)) return;
      }
      const wxss_path = styleEl.getAttribute("wxss:path");
      if (["", "null", "undefined", void 0, null].includes(wxss_path)) return;
      let cssText = styleEl.innerHTML;
      cssText = cssText.replace(cssBodyToPageReg, "page{");
      saveLocalFile(this.pathInfo.outputResolve(wxss_path), cssbeautify(cssText));
      printLog(` Completed  (${cssText.length}) 	` + colors.bold(colors.gray(wxss_path)));
    });
    if (children.length) {
      printLog(` ▶ 反编译所有 wxss 文件成功. 
`, { isStart: true });
    }
  }
  functionToWXS(wxsFunc, basePath) {
    if (!basePath) {
      throw new Error("basePath is required");
    }
    const funcHeader = "nv_module={nv_exports:{}};";
    const funcEnd = "return nv_module.nv_exports;}";
    const matchReturnReg = /return\s*\(\{(.|\r|\t|\n)*?}\)/;
    const wxsCodeRequireReg = /require\(.+?\(\);/g;
    let code = wxsFunc.toString();
    code = code.slice(code.indexOf(funcHeader) + funcHeader.length, code.lastIndexOf(funcEnd)).replaceAll("nv_", "");
    code = code.replace(wxsCodeRequireReg, (matchString) => {
      const newRequireString = resetWxsRequirePath(matchString, "./").replace(`require("`, "").replace(`")();`, "");
      let relativePath = path.relative(
        this.pathInfo.resolve(path.dirname(basePath)),
        this.pathInfo.resolve(newRequireString)
      );
      return `require('${relativePath}');`;
    });
    const matchInfo = matchReturnReg.exec(code);
    const matchList = [];
    if (matchInfo) {
      matchInfo.forEach((str) => str.startsWith("return") && str.endsWith("})") && matchList.push(str));
    }
    matchList.forEach((returnStr) => {
      let newReturnString = "";
      let temp = returnStr.replace("return", "").trim();
      if (temp.startsWith("({") && temp.endsWith("})")) {
        newReturnString = `return {${temp.substring(2, temp.length - 2)}}`;
        code = code.replace(returnStr, newReturnString);
      }
    });
    return jsBeautify(code);
  }
  /**
   * 执行所有的 $gwx_ 函数， 包含 主环境 和 插件函数
   * */
  executeAllGwxFunction(code) {
    code = code.replaceAll(
      "var e_={}",
      `var e_ = {}; window.COMPONENTS = global;`
    ).replaceAll(
      "function(){if(!nnm[n])",
      `function(){ return {n, func: nnm[n]};`
    );
    const vm = createVM({
      sandbox: {
        setTimeout
      }
    });
    runVmCode(vm, code);
    const PLUGINS = {};
    const COMPONENTS = {
      entrys: {},
      modules: {},
      defines: {}
    };
    const ALL_ENTRYS = {};
    const ALL_MODULES = {};
    const ALL_DEFINES = {};
    const pluginNames = glob.globSync(`${this.pathInfo.resolve(pluginDirRename[1])}/*`).map((pluginPath) => path.basename(pluginPath)).filter(isWxAppid);
    for (const name in vm.sandbox) {
      const func = vm.sandbox[name];
      if (typeof func !== "function") continue;
      vm.sandbox.__wxAppCode__ = {};
      const isPlugin = name.startsWith("$gwx_wx") && pluginNames.find((pluginName) => name.includes(pluginName));
      const global = {};
      if (isPlugin) {
        const appId = name.replace("$gwx_", "");
        try {
          func(void 0, global);
          PLUGINS[appId] = global;
        } catch (e) {
        }
      } else if (name.startsWith("$gwx")) {
        try {
          func("", COMPONENTS)();
        } catch (e) {
        }
      }
    }
    const getWxsInfo = (data, appid) => {
      if (typeof data !== "function") return data;
      data = data();
      data.isInline = data.n.startsWith("m_");
      const wxsPath = `${resetWxsRequirePath(data.n).split(":")[0]}`;
      if (appid) {
        data.appid = appid;
        data.n = path.join(this.pathInfo.packRootPath, pluginDirRename[0], appid, wxsPath);
      } else {
        data.n = path.join(this.pathInfo.packRootPath, wxsPath);
      }
      return data;
    };
    const wxsModuleProcess = (receive, _path, data, appid) => {
      const ext = path.extname(_path);
      if (ext === ".wxs" && typeof data === "function") {
        data = getWxsInfo(data, appid);
      }
      if (ext === ".wxml" && typeof data === "object") {
        for (const moduleName in data) {
          data[moduleName] = getWxsInfo(data[moduleName], appid);
        }
      }
      receive[_path] = data;
    };
    const merge = (receive, type) => {
      for (let _path in COMPONENTS[type]) {
        let data = COMPONENTS[type][_path];
        if (type === "modules") {
          wxsModuleProcess(receive, _path, data);
        } else {
          receive[path.join(_path)] = COMPONENTS[type][_path];
        }
      }
      for (const appid in PLUGINS) {
        const plugin = PLUGINS[appid];
        for (let _path in plugin[type]) {
          let data = plugin[type][_path];
          _path = path.join(this.pathInfo.packRootPath, pluginDirRename[0], appid, _path);
          if (type === "modules") {
            wxsModuleProcess(receive, _path, data, appid);
          } else {
            receive[path.join(_path)] = data;
          }
        }
      }
    };
    merge(ALL_ENTRYS, "entrys");
    merge(ALL_MODULES, "modules");
    merge(ALL_DEFINES, "defines");
    return {
      COMPONENTS,
      PLUGINS,
      ALL_ENTRYS,
      ALL_MODULES,
      ALL_DEFINES
    };
  }
  async decompileAppWXS() {
    let code = this.getRuntimeCode("gwx");
    if (!code) return;
    const { ALL_MODULES, PLUGINS } = this.executeAllGwxFunction(code);
    const wxsRefInfo = [];
    for (const wxmlPath in ALL_MODULES) {
      if (path.extname(wxmlPath) !== ".wxml") continue;
      const wxmlRefWxsInfo = ALL_MODULES[wxmlPath];
      for (const moduleName in wxmlRefWxsInfo) {
        const { n, func, isInline } = wxmlRefWxsInfo[moduleName];
        if (n && func) {
          wxsRefInfo.push({
            wxmlPath,
            wxsPath: n,
            isInline,
            moduleName,
            wxsRender: func,
            templateList: []
          });
        }
      }
    }
    wxsRefInfo.forEach((item) => {
      if (item.isInline) return;
      if (!item.wxsPath.endsWith(".wxs")) return;
      const wxsString = this.functionToWXS(item.wxsRender, item.wxsPath);
      saveLocalFile(this.pathInfo.outputResolve(item.wxsPath), wxsString);
      printLog(` Completed  (${wxsString.length}) 	` + colors.bold(colors.gray(item.wxsPath)));
    });
    for (const wxsPath in ALL_MODULES) {
      if (!wxsPath.endsWith(".wxs")) continue;
      const result = ALL_MODULES[wxsPath];
      const wxsString = this.functionToWXS(result.func, wxsPath);
      saveLocalFile(this.pathInfo.outputResolve(wxsPath), wxsString);
      printLog(` Completed  (${wxsString.length}) 	` + colors.bold(colors.gray(wxsPath)));
    }
    wxsRefInfo.forEach((item) => {
      let relativePath = path.relative(
        this.pathInfo.resolve(path.dirname(item.wxmlPath)),
        this.pathInfo.resolve(item.wxsPath)
      );
      if (item.isInline) {
        item.templateList.push(`<wxs module="${item.moduleName}">
${this.functionToWXS(item.wxsRender, item.wxsPath)}
</wxs>`);
      } else {
        item.templateList.push(`<wxs module="${item.moduleName}" src="${relativePath}"/>`);
      }
    });
    wxsRefInfo.forEach((item) => {
      if (item.templateList && !item.templateList.length) return;
      const wxmlAbsolutePath = this.pathInfo.outputResolve(item.wxmlPath);
      const templateString = item.templateList.join("\n");
      const wxmlCode = readLocalFile(wxmlAbsolutePath);
      saveLocalFile(wxmlAbsolutePath, `${wxmlCode}
${templateString}`, { force: true });
    });
    if (Object.keys(wxsRefInfo).length) {
      printLog(` ▶ 反编译所有 wxs 文件成功. 
`, { isStart: true });
    }
  }
  /**
   * 获取定义的 X 路径池， 池中的内容顺序不能变
   * */
  _getXPool(code) {
    let xPool = [];
    const xPoolReg = /var\s+x=\s*\[(.+)];\$?/g;
    const regResList = (code.match(xPoolReg) || []).sort((a, b) => b.length - a.length);
    if (regResList.length && regResList[0].includes("var x=[") && regResList[0].includes(".wxml")) {
      xPool = regResList[0].replaceAll("var x=[", "").replaceAll("];", "").split(",").map((str) => str.replaceAll("'", ""));
    }
    return xPool;
  }
  async decompileAppWXML() {
    let code = this.getRuntimeCode("gwx");
    if (!code) return;
    const { ALL_DEFINES, ALL_ENTRYS } = this.executeAllGwxFunction(code);
    let xPool = this._getXPool(code);
    const vm = createVM();
    runVmCode(vm, code);
    getZ(code, (z) => {
      const entrys = ALL_ENTRYS;
      for (let wxmlPath in entrys) {
        let result = tryDecompileWxml(entrys[wxmlPath].f.toString(), z, ALL_DEFINES[wxmlPath], xPool);
        if (result) {
          const jsdom = new JSDOM(result);
          const document = jsdom.window.document;
          const allImageEls = document.querySelectorAll("[src]");
          const matchAppidInfo = /__plugin__\/(\w+)\//.exec(wxmlPath);
          if (matchAppidInfo && wxmlPath.includes(pluginDirRename[0])) {
            const appid = matchAppidInfo[1];
            const pluginRoot = path.join(wxmlPath.split(appid)[0], appid);
            const srcList = Array.from(allImageEls).map((node) => {
              let src = node.getAttribute("src");
              const originSrc = src;
              if (src.includes("{{") && src.includes("}}")) return null;
              if (!src.trim()) return null;
              if (src.startsWith("/")) {
                src = path.join(pluginRoot, src);
                src = path.relative(path.dirname(wxmlPath), src);
              }
              return [originSrc, src];
            }).filter(Boolean);
            srcList.forEach(([originSrc, src]) => {
              result = result.replaceAll(originSrc, src);
            });
          }
          const wxmlFullPath = this.pathInfo.outputResolve(wxmlPath);
          saveLocalFile(wxmlFullPath, result, { force: true });
          printLog(` Completed  (${result.length}) 	${colors.bold(colors.gray(wxmlPath))}`);
        }
      }
    });
    await sleep(200);
    printLog(` ▶ 反编译所有 wxml 文件成功. 
`, { isStart: true });
  }
  async decompileAll(options = {}) {
    super.decompileAll();
    await this.initApp();
    await this.decompileAllJSON();
    await this.decompileAppJSON();
    await this.decompileAppJS();
    if (options.usePx) {
      await this.decompileAppWXSS();
    } else {
      await this.decompileAppWXSSWithRpx();
    }
    await this.decompileAppWXML();
    await this.decompileAppWXS();
    await this.decompileAppWorkers();
  }
}
function decryptWxapkg(wxid, encryptedData) {
  const salt = "saltiest";
  const iv = Buffer.from("the iv: 16 bytes");
  const dk = crypto.pbkdf2Sync(wxid, salt, 1e3, 32, "sha1");
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    new Uint8Array(dk),
    new Uint8Array(iv)
  );
  decipher.setAutoPadding(false);
  const encryptedPart = encryptedData.subarray(6, 6 + 1024);
  const updateResult = decipher.update(new Uint8Array(encryptedPart));
  const finalResult = decipher.final();
  const decryptedPart = Buffer.concat([
    new Uint8Array(updateResult),
    new Uint8Array(finalResult)
  ]);
  const xorKey = wxid.length >= 2 ? wxid.charCodeAt(wxid.length - 2) : 102;
  const remainingData = encryptedData.subarray(6 + 1024);
  const xorDecrypted = Buffer.alloc(remainingData.length);
  for (let i = 0; i < remainingData.length; i++) {
    xorDecrypted[i] = remainingData[i] ^ xorKey;
  }
  return Buffer.concat([
    new Uint8Array(decryptedPart.subarray(0, 1023)),
    new Uint8Array(xorDecrypted)
  ]);
}
function needsDecryption(data) {
  if (data.length < 14) return false;
  const firstMark = data.readUInt8(0);
  const lastMark = data.readUInt8(13);
  return firstMark !== 190 || lastMark !== 237;
}
class UnpackWxapkg {
  /**
   * 获取包中的文件列表, 包含开始和结束的字节信息
   * */
  static genFileList(__APP_BUF__) {
    const headerBuffer = __APP_BUF__.subarray(0, 18);
    let firstMark = headerBuffer.readUInt8(0);
    let indexInfoLength = headerBuffer.readUInt32BE(5) + 18;
    let lastMark = headerBuffer.readUInt8(13);
    let fileCount = headerBuffer.readUInt32BE(14);
    if (firstMark !== 190 || lastMark !== 237) {
      console.log(
        ` 
❌ ${colors.red(
          "这不是一个正确的小程序包,在微信3.8版本以下的 PC, MAC 包需要解密\n所以你需要尝试先使用项目中的解密工具 decryption-tool/UnpackMiniApp.exe 解密"
        )}
地址:  https://github.com/biggerstar/wedecode'`
      );
      process$1.exit(0);
    }
    const indexBuf = __APP_BUF__.subarray(14, indexInfoLength);
    let fileList = [], offset = 4;
    for (let i = 0; i < fileCount; i++) {
      const info = {};
      const nameLen = indexBuf.readUInt32BE(offset);
      offset += 4;
      info.path = indexBuf.toString("utf8", offset, offset + nameLen);
      offset += nameLen;
      info.off = indexBuf.readUInt32BE(offset);
      offset += 4;
      info.size = indexBuf.readUInt32BE(offset);
      offset += 4;
      fileList.push(info);
    }
    if (!fileList.length) {
      printLog(colors.red("❌  未成功解压小程序包."));
      process$1.exit(0);
    }
    return fileList;
  }
  /**
   * 从路径中提取 wxid
   */
  static extractWxid(filePath) {
    const normalizedPath = path.normalize(filePath);
    const parts = normalizedPath.split(path.sep);
    for (const part of parts) {
      if (isWxAppid(part)) {
        return part;
      }
    }
    return null;
  }
  /**
   * 解析并保存该包中的所有文件
   * 返回获取该包各种信息 和 路径的操作对象
   * */
  static async unpackWxapkg(inputPath, outputPath, externalWxid) {
    let __APP_BUF__ = fs.readFileSync(inputPath);
    if (needsDecryption(__APP_BUF__)) {
      const wxid = externalWxid || UnpackWxapkg.extractWxid(inputPath);
      if (wxid) {
        printLog(`
 ▶ 检测到加密包，正在解密... (wxid: ${colors.blue(wxid)})`, { isStart: true });
        __APP_BUF__ = decryptWxapkg(wxid, __APP_BUF__);
      } else {
        console.log(
          ` 
❌ ${colors.red(
            "检测到加密包，但无法从路径中提取 wxid\n请确保包路径中包含小程序 appid (如 wx1234567890abcdef)"
          )}`
        );
        process$1.exit(0);
      }
    }
    const fileList = [];
    fileList.splice(0, fileList.length, ...UnpackWxapkg.genFileList(__APP_BUF__));
    const pathInfo = getPathResolveInfo(outputPath);
    const outputPathInfo = getPathResolveInfo(outputPath);
    let packType = "sub";
    let appType = "app";
    let subPackRootPath = findCommonRoot(fileList.map((item) => item.path));
    if (subPackRootPath) {
      pathInfo.setPackRootPath(subPackRootPath);
    }
    for (let info of fileList) {
      const fileName = info.path.startsWith("/") ? info.path.slice(1) : info.path;
      const data = __APP_BUF__.subarray(info.off, info.off + info.size);
      const subRootPath = pathInfo.outputResolve(fileName);
      saveLocalFile(subRootPath, data);
    }
    const appConfigJsonString = readLocalFile(pathInfo.appConfigJsonPath);
    if (appConfigJsonString) {
      const appConfig = JSON.parse(appConfigJsonString);
      const foundThatSubPackages = (appConfig.subPackages || []).find((sub) => sub.root === `${subPackRootPath}/`);
      if (!foundThatSubPackages) {
        packType = "main";
      } else if (typeof foundThatSubPackages === "object" && foundThatSubPackages["independent"]) {
        packType = "independent";
      }
    }
    if (fs.existsSync(outputPathInfo.gameJsPath)) {
      appType = "game";
    }
    printLog(`
 ▶ 解小程序压缩包 ${colors.blue(path.basename(inputPath))} 成功! 文件总数: ${colors.green(fileList.length)}`, { isStart: true });
    return {
      appType,
      packType,
      subPackRootPath,
      pathInfo,
      outputPathInfo,
      inputPath,
      outputPath
    };
  }
}
class FileCleanerUtils {
  /**
   * 移除反编译过程中产生的缓存文件
   * @param outputPath 输出路径
   */
  static async removeCache(outputPath) {
    await sleep(500);
    let cont = 0;
    const removeFileList = removeGameFileList.concat(removeAppFileList);
    const allFile = glob.globSync(`${outputPath}/**/**{.js,.html,.json}`);
    allFile.forEach((filepath) => {
      const fileName = path.basename(filepath).trim();
      const extname = path.extname(filepath);
      if (!fs.existsSync(filepath)) return;
      let _deleteLocalFile = () => {
        cont++;
        deleteLocalFile(filepath, { catch: true, force: true });
      };
      if (removeFileList.includes(fileName)) {
        _deleteLocalFile();
      } else if (extname === ".html") {
        const feature = "var __setCssStartTime__ = Date.now()";
        const data = readLocalFile(filepath);
        if (data.includes(feature)) _deleteLocalFile();
      } else if (filepath.endsWith(".appservice.js")) {
        _deleteLocalFile();
      } else if (filepath.endsWith(".webview.js")) {
        _deleteLocalFile();
      }
    });
    if (cont) {
      printLog(`
 ▶ 移除中间缓存产物成功, 总计 ${colors.yellow(cont)} 个`, { isStart: true });
    }
  }
  /**
   * 清理指定类型的文件
   * @param outputPath 输出路径
   * @param filePatterns 文件匹配模式数组
   * @param description 清理描述
   */
  static async cleanFilesByPattern(outputPath, filePatterns, description = "文件") {
    let count = 0;
    for (const pattern of filePatterns) {
      const files = glob.globSync(path.join(outputPath, pattern));
      files.forEach((filepath) => {
        if (fs.existsSync(filepath)) {
          deleteLocalFile(filepath, { catch: true, force: true });
          count++;
        }
      });
    }
    if (count > 0) {
      printLog(`
 ▶ 清理${description}成功, 总计 ${colors.yellow(count)} 个`, { isStart: true });
    }
    return count;
  }
  /**
   * 清理空目录
   * @param outputPath 输出路径
   */
  static async cleanEmptyDirectories(outputPath) {
    let count = 0;
    const cleanEmptyDir = (dirPath) => {
      if (!fs.existsSync(dirPath)) return false;
      const files = fs.readdirSync(dirPath);
      let isEmpty = true;
      for (const file of files) {
        const fullPath = path.join(dirPath, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          if (!cleanEmptyDir(fullPath)) {
            isEmpty = false;
          }
        } else {
          isEmpty = false;
        }
      }
      if (isEmpty && dirPath !== outputPath) {
        try {
          fs.rmdirSync(dirPath);
          count++;
          return true;
        } catch (error) {
          console.warn(`删除空目录失败: ${dirPath}`, error.message);
          return false;
        }
      }
      return false;
    };
    cleanEmptyDir(outputPath);
    if (count > 0) {
      printLog(`
 ▶ 清理空目录成功, 总计 ${colors.yellow(count)} 个`, { isStart: true });
    }
    return count;
  }
}
class DefaultFilesGeneratorUtils {
  /**
   * 分析组件依赖关系
   * @param outputPath 输出路径
   * @param analysisList 需要分析的页面列表
   * @param deps 依赖数组
   * @returns 所有页面和组件的路径列表
   */
  static async analyzeComponentDependencies(outputPath, analysisList, deps = []) {
    const allDeps = [...deps];
    for (const pagePath of analysisList) {
      if (allDeps.includes(pagePath)) continue;
      allDeps.push(pagePath);
      const pageDirPath = path.dirname(pagePath);
      const pageJsonPath = path.join(outputPath, replaceExt(pagePath, ".json"));
      if (fs.existsSync(pageJsonPath)) {
        try {
          const pageConfig = readLocalJsonFile(pageJsonPath);
          const usingComponents = (pageConfig == null ? void 0 : pageConfig.usingComponents) || {};
          const componentPaths = Object.values(usingComponents).map((op) => {
            if (isPluginPath(op)) {
              return op;
            }
            return path.join(pageDirPath, op).split(path.sep).join("/");
          });
          if (componentPaths.length > 0) {
            const newDeps = await DefaultFilesGeneratorUtils.analyzeComponentDependencies(
              outputPath,
              componentPaths,
              allDeps
            );
            allDeps.push(...newDeps.filter((dep) => !allDeps.includes(dep)));
          }
        } catch (error) {
          console.warn(`解析页面配置失败: ${pageJsonPath}`, error.message);
        }
      }
    }
    return allDeps;
  }
  /**
   * 生成组件构成必要的默认文件 (json, js, wxml)
   * @param outputPath 输出路径
   */
  static async generateDefaultAppFiles(outputPath) {
    const appConfigJson = readLocalJsonFile(path.join(outputPath, "app-config.json"));
    const appConfigPages = ((appConfigJson == null ? void 0 : appConfigJson.pages) || []).map((cPath) => cPath.endsWith("/") ? cPath.substring(0, cPath.length - 1) : cPath);
    const allPage = await DefaultFilesGeneratorUtils.analyzeComponentDependencies(
      outputPath,
      appConfigPages
    );
    const allPageAndComp = allPage.filter((_path) => !isPluginPath(_path));
    for (let pagePath of allPageAndComp) {
      let jsonPath = path.join(outputPath, replaceExt(pagePath, ".json"));
      saveLocalFile(jsonPath, '{\n  "component":true\n}');
      let jsName = replaceExt(pagePath, ".js");
      let jsPath = path.join(outputPath, jsName);
      saveLocalFile(jsPath, "Page({ data: {} })");
      let wxmlName = replaceExt(pagePath, ".wxml");
      let wxmlPath = path.join(outputPath, wxmlName);
      saveLocalFile(wxmlPath, `<text>${wxmlName}</text>`);
    }
    printLog(` ▶ 生成页面和组件构成必要的默认文件成功. 
`, { isStart: true });
  }
  /**
   * 生成单个页面的默认文件
   * @param outputPath 输出路径
   * @param pagePath 页面路径
   * @param options 生成选项
   */
  static generatePageFiles(outputPath, pagePath, options = {}) {
    const {
      generateJson = true,
      generateJs = true,
      generateWxml = true,
      generateWxss = false,
      jsContent = "Page({ data: {} })",
      jsonContent = '{\n  "component":true\n}',
      wxmlContent = `<text>${pagePath}</text>`,
      wxssContent = `/* ${pagePath} styles */`
    } = options;
    if (generateJson) {
      const jsonPath = path.join(outputPath, replaceExt(pagePath, ".json"));
      saveLocalFile(jsonPath, jsonContent);
    }
    if (generateJs) {
      const jsPath = path.join(outputPath, replaceExt(pagePath, ".js"));
      saveLocalFile(jsPath, jsContent);
    }
    if (generateWxml) {
      const wxmlPath = path.join(outputPath, replaceExt(pagePath, ".wxml"));
      saveLocalFile(wxmlPath, wxmlContent);
    }
    if (generateWxss) {
      const wxssPath = path.join(outputPath, replaceExt(pagePath, ".wxss"));
      saveLocalFile(wxssPath, wxssContent);
    }
  }
  /**
   * 批量生成页面文件
   * @param outputPath 输出路径
   * @param pageList 页面列表
   * @param options 生成选项
   */
  static generateMultiplePageFiles(outputPath, pageList, options) {
    pageList.forEach((pagePath) => {
      DefaultFilesGeneratorUtils.generatePageFiles(outputPath, pagePath, options);
    });
    printLog(` ▶ 批量生成 ${pageList.length} 个页面的默认文件成功`, { isStart: true });
  }
}
class DecompilationController {
  inputPath;
  outputPath;
  workspaceId;
  config;
  pathInfo;
  firstPackInfo = null;
  // 保存第一个包的信息，用于获取小程序信息
  constructor(inputPath, outputPath, workspaceId) {
    if (!inputPath) {
      throw new Error("inputPath 是必须的");
    }
    if (!outputPath) {
      throw new Error("outputPath 是必须的");
    }
    this.inputPath = path.resolve(inputPath);
    this.outputPath = path.resolve(outputPath);
    this.workspaceId = workspaceId;
    this.pathInfo = getPathResolveInfo(this.outputPath);
    this.config = {
      usePx: false,
      unpackOnly: false
    };
  }
  setState(opt) {
    Object.assign(this.config, opt);
  }
  /**
   * 单包反编译
   * */
  async singlePackMode(wxapkgPath, outputPath) {
    const packInfo = await UnpackWxapkg.unpackWxapkg(wxapkgPath, outputPath, this.config.wxid);
    if (!this.firstPackInfo) {
      this.firstPackInfo = packInfo;
    }
    if (this.config.unpackOnly) return;
    if (packInfo.appType === "game") {
      const decompilationGame = new GameDecompilation(packInfo);
      await decompilationGame.decompileAll();
    } else {
      const decompilationApp = new AppDecompilation(packInfo);
      decompilationApp.convertPlugin = true;
      await decompilationApp.decompileAll({
        usePx: this.config.usePx
      });
    }
    printLog(`
 ✅  ${colors.bold(colors.green(PackTypeMapping[packInfo.packType] + "反编译结束!"))}`, { isEnd: true });
  }
  /**
   * 尝试获取并更新小程序信息
   */
  async tryGetAndUpdateAppInfo(packInfo) {
    await WxAppInfoUtils.tryGetAndUpdateAppInfoFromPack(this.workspaceId, packInfo, 3e3, this.config.wxid);
  }
  /**
   * 启动反编译流程
   * ]*/
  async startDecompilerProcess() {
    const isDirectory = fs.statSync(this.inputPath).isDirectory();
    printLog(`
 ▶ 当前操作类型: ${colors.yellow(isDirectory ? "分包模式" : "单包模式")}`, { isEnd: true });
    if (isDirectory) {
      let wxapkgPathList = glob.globSync(`${this.inputPath}/*.wxapkg`);
      if (wxapkgPathList.length === 0) {
        const allFiles = fs.readdirSync(this.inputPath).map((file) => path.join(this.inputPath, file));
        wxapkgPathList = allFiles.filter((filePath) => {
          const stats = fs.statSync(filePath);
          return stats.isFile();
        });
      }
      wxapkgPathList.sort((_pathA, _b) => {
        const foundMainPackage = AppMainPackageNames.find((fileName) => _pathA.endsWith(fileName));
        if (foundMainPackage) return -1;
        return 0;
      });
      for (const packPath of wxapkgPathList) {
        await this.singlePackMode(packPath, this.outputPath);
      }
    } else {
      await this.singlePackMode(this.inputPath, this.outputPath);
    }
    await this.endingAllJob();
  }
  /**
   * 生成项目配置文件
   * */
  async generaProjectConfigFiles() {
    await ProjectConfigUtils.generateProjectConfigFiles(this.outputPath);
  }
  /**
   * 生成组件构成必要素的默认 json wxs, wxml, wxss 文件
   * */
  async generateDefaultAppFiles() {
    await DefaultFilesGeneratorUtils.generateDefaultAppFiles(this.outputPath);
  }
  /**
   * 缓存移除
   * */
  async removeCache() {
    await FileCleanerUtils.removeCache(this.outputPath);
  }
  /**
   * 收尾工作
   * */
  async endingAllJob() {
    if (this.firstPackInfo) {
      await this.tryGetAndUpdateAppInfo(this.firstPackInfo);
    }
    if (this.config.unpackOnly) {
      printLog(` ✅  ${colors.bold(colors.green("解包流程结束!"))}`, { isEnd: true });
      return;
    }
    await this.generateDefaultAppFiles();
    await this.generaProjectConfigFiles();
    if (!isDev) {
      await this.removeCache();
    }
    printLog(` ✅  ${colors.bold(colors.green("编译流程结束!"))}`, { isEnd: true });
  }
}
export {
  AppMainPackageNames as A,
  CacheClearEnum as C,
  DecompilationController as D,
  OperationModeEnum as O,
  PUBLIC_OUTPUT_PATH as P,
  StreamPathDefaultEnum as S,
  WxAppInfoUtils as W,
  YesOrNoEnum as Y,
  clearScreen as c,
  globPathList as g,
  isWxAppid as i,
  printLog as p,
  sleep as s
};
