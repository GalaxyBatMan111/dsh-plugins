import express from "express";
import cors from "cors";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { WebSocketServer } from "ws";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "url";
var define_process_env_default = {};
const __filename$1 = fileURLToPath(import.meta.url);
const __dirname$1 = path.dirname(__filename$1);
class WorkspaceServer {
  app;
  server;
  wss;
  workspaces = /* @__PURE__ */ new Map();
  executions = /* @__PURE__ */ new Map();
  workspacesDir;
  uploadsDir;
  outputDir;
  constructor(port = 3e3) {
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    this.workspacesDir = define_process_env_default.WORKSPACE_ROOT ? path.join(define_process_env_default.WORKSPACE_ROOT, "workspaces") : path.join(process.cwd(), "workspaces");
    this.uploadsDir = path.join(this.workspacesDir, "uploads");
    this.outputDir = path.join(this.workspacesDir, "output");
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.ensureDirectories();
    this.loadWorkspaces();
    this.server.listen(port, () => {
      console.log("");
      console.log("🤖 可视化反编译小程序");
      console.log(`🚀 访问地址: http://localhost:${port}`);
      console.log("");
    });
  }
  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json({ limit: "2gb" }));
    this.app.use(express.urlencoded({ extended: true, limit: "2gb" }));
    const publicPath = path.join(__dirname$1, "../../public");
    this.app.use("/static", express.static(publicPath));
    this.app.use(express.static(publicPath));
  }
  setupRoutes() {
    this.app.get("/api/workspaces", this.getWorkspaces.bind(this));
    this.app.post("/api/workspaces", this.createWorkspace.bind(this));
    this.app.get("/api/workspaces/:id", this.getWorkspace.bind(this));
    this.app.delete("/api/workspaces/:id", this.deleteWorkspace.bind(this));
    this.app.get("/api/workspaces/:id/files", this.getFileTree.bind(this));
    this.app.get("/api/workspaces/:id/file", this.getFile.bind(this));
    this.app.post("/api/workspaces/:id/file", this.saveFile.bind(this));
    this.app.put("/api/workspaces/:id/file", this.createFile.bind(this));
    this.app.delete("/api/workspaces/:id/file", this.deleteFile.bind(this));
    this.app.post("/api/workspaces/:id/execute", this.executeCommand.bind(this));
    this.app.get("/api/workspaces/:id/executions", this.getExecutions.bind(this));
    this.app.delete("/api/executions/:executionId", this.killExecution.bind(this));
    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        const id = req.params.id;
        const workspace = this.workspaces.get(id);
        const destDir = workspace ? path.join(workspace.path, "uploads") : this.uploadsDir;
        try {
          fs.mkdirSync(destDir, { recursive: true });
        } catch {
        }
        cb(null, destDir);
      },
      filename: (req, file, cb) => {
        cb(null, file.originalname);
      }
    });
    const upload = multer({
      storage,
      limits: {
        fileSize: 500 * 1024 * 1024,
        // 单个文件最大 500MB
        files: 200,
        // 最多 200 个文件
        fieldSize: 2 * 1024 * 1024 * 1024
        // 总请求大小最大 2GB
      }
    });
    this.app.post(
      "/api/workspaces/:id/decompile",
      upload.fields([{ name: "wxapkg", maxCount: 100 }, { name: "options", maxCount: 1 }]),
      this.handleUploadError.bind(this),
      this.decompileWxapkg.bind(this)
    );
    this.app.post("/api/workspaces/:id/compile-folder", this.compileFolderWxapkg.bind(this));
    this.app.post("/api/workspaces/:id/batch-decompile", this.batchDecompileWorkspace.bind(this));
    this.app.get("/api/workspaces/:id/download", this.downloadWorkspace.bind(this));
    this.app.put("/api/workspaces/:id/appinfo", this.updateWorkspaceAppInfo.bind(this));
    this.app.get("/api/health", (req, res) => {
      res.json({ status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
    });
    this.app.get("/", (req, res) => {
      const indexPath = path.join(__dirname$1, "../../public/index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Wedecode - 文件未找到</title>
            <meta charset="UTF-8">
          </head>
          <body>
            <h1>Wedecode 微信小程序反编译工具</h1>
            <p>抱歉，前端文件未找到。</p>
            <p>请确保 public 目录已正确包含在安装包中。</p>
            <p>当前查找路径: ${indexPath}</p>
            <p>API 服务正常运行在: <a href="/api/health">/api/health</a></p>
          </body>
          </html>
        `);
      }
    });
  }
  setupWebSocket() {
    this.wss.on("connection", (ws) => {
      console.log("WebSocket client connected");
      ws.on("message", (message) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleWebSocketMessage(ws, data);
        } catch (error) {
          console.error("WebSocket message error:", error);
        }
      });
      ws.on("close", () => {
        console.log("WebSocket client disconnected");
      });
    });
  }
  handleWebSocketMessage(ws, data) {
    switch (data.type) {
      case "subscribe":
        ws.workspaceId = data.workspaceId;
        break;
      case "ping":
        ws.send(JSON.stringify({ type: "pong" }));
        break;
    }
  }
  broadcastToWorkspace(workspaceId, message) {
    this.wss.clients.forEach((client) => {
      if (client.workspaceId === workspaceId && client.readyState === 1) {
        client.send(JSON.stringify(message));
      }
    });
  }
  ensureDirectories() {
    [this.workspacesDir, this.uploadsDir, this.outputDir].forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }
  loadWorkspaces() {
    try {
      const configPath = path.join(this.workspacesDir, "workspaces.json");
      if (fs.existsSync(configPath)) {
        const data = fs.readFileSync(configPath, "utf-8");
        const workspacesData = JSON.parse(data);
        workspacesData.forEach((workspace) => {
          this.workspaces.set(workspace.id, {
            ...workspace,
            createdAt: new Date(workspace.createdAt),
            updatedAt: new Date(workspace.updatedAt)
          });
        });
      }
    } catch (error) {
      console.error("Failed to load workspaces:", error);
    }
  }
  saveWorkspaces() {
    try {
      const configPath = path.join(this.workspacesDir, "workspaces.json");
      const workspacesData = Array.from(this.workspaces.values());
      fs.writeFileSync(configPath, JSON.stringify(workspacesData, null, 2));
    } catch (error) {
      console.error("Failed to save workspaces:", error);
    }
  }
  generateId() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
  handleUploadError(error, req, res, next) {
    if (error instanceof multer.MulterError) {
      switch (error.code) {
        case "LIMIT_FILE_SIZE":
          res.status(413).json({
            error: "文件大小超过限制",
            message: "单个文件大小不能超过 500MB",
            code: "FILE_TOO_LARGE"
          });
          return;
        case "LIMIT_FILE_COUNT":
          res.status(413).json({
            error: "文件数量超过限制",
            message: "最多只能上传 200 个文件",
            code: "TOO_MANY_FILES"
          });
          return;
        case "LIMIT_FIELD_VALUE":
          res.status(413).json({
            error: "请求数据过大",
            message: "总请求大小不能超过 2GB",
            code: "REQUEST_TOO_LARGE"
          });
          return;
        default:
          res.status(400).json({
            error: "文件上传错误",
            message: error.message,
            code: "UPLOAD_ERROR"
          });
          return;
      }
    }
    next(error);
  }
  // API 路由处理器
  async getWorkspaces(req, res) {
    try {
      const workspaces = Array.from(this.workspaces.values());
      res.json(workspaces);
    } catch (error) {
      res.status(500).json({ error: "Failed to get workspaces" });
    }
  }
  async createWorkspace(req, res) {
    try {
      const { name, type, description } = req.body;
      const id = this.generateId();
      const workspacePath = path.join(this.workspacesDir, id);
      const workspace = {
        id,
        name,
        type,
        description,
        createdAt: /* @__PURE__ */ new Date(),
        updatedAt: /* @__PURE__ */ new Date(),
        path: workspacePath
      };
      fs.mkdirSync(workspacePath, { recursive: true });
      this.workspaces.set(id, workspace);
      this.saveWorkspaces();
      res.json(workspace);
    } catch (error) {
      console.error("Create workspace error:", error);
      res.status(500).json({ error: "Failed to create workspace" });
    }
  }
  async getWorkspace(req, res) {
    try {
      const { id } = req.params;
      const workspace = this.workspaces.get(id);
      if (!workspace) {
        res.status(404).json({ error: "Workspace not found" });
        return;
      }
      res.json(workspace);
    } catch (error) {
      res.status(500).json({ error: "Failed to get workspace" });
    }
  }
  async deleteWorkspace(req, res) {
    try {
      const { id } = req.params;
      const workspace = this.workspaces.get(id);
      if (!workspace) {
        res.status(404).json({ error: "Workspace not found" });
        return;
      }
      if (fs.existsSync(workspace.path)) {
        fs.rmSync(workspace.path, { recursive: true, force: true });
      }
      this.workspaces.delete(id);
      this.saveWorkspaces();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete workspace" });
    }
  }
  async getFileTree(req, res) {
    try {
      const { id } = req.params;
      const workspace = this.workspaces.get(id);
      if (!workspace) {
        res.status(404).json({ error: "Workspace not found" });
        return;
      }
      const fileTree = this.buildFileTree(workspace.path, workspace.path);
      res.json(fileTree);
    } catch (error) {
      res.status(500).json({ error: "Failed to get file tree" });
    }
  }
  buildFileTree(dirPath, rootPath) {
    const stats = fs.statSync(dirPath);
    const name = path.basename(dirPath);
    const relativePath = path.relative(rootPath, dirPath);
    const node = {
      name,
      path: relativePath || ".",
      type: stats.isDirectory() ? "directory" : "file"
    };
    if (stats.isDirectory()) {
      try {
        const children = fs.readdirSync(dirPath).filter((child) => !child.startsWith(".")).map((child) => this.buildFileTree(path.join(dirPath, child), rootPath)).sort((a, b) => {
          if (a.type !== b.type) {
            return a.type === "directory" ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });
        node.children = children;
      } catch (error) {
        node.children = [];
      }
    } else {
      node.size = stats.size;
    }
    return node;
  }
  async getFile(req, res) {
    try {
      const { id } = req.params;
      const filepath = req.query.path;
      const workspace = this.workspaces.get(id);
      if (!workspace) {
        res.status(404).json({ error: "Workspace not found" });
        return;
      }
      const fullPath = path.join(workspace.path, filepath);
      if (!fs.existsSync(fullPath)) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      const content = fs.readFileSync(fullPath, "utf-8");
      res.json({ content, path: filepath });
    } catch (error) {
      res.status(500).json({ error: "Failed to read file" });
    }
  }
  async saveFile(req, res) {
    try {
      const { id } = req.params;
      const { filepath, content } = req.body;
      const workspace = this.workspaces.get(id);
      if (!workspace) {
        res.status(404).json({ error: "Workspace not found" });
        return;
      }
      const fullPath = path.join(workspace.path, filepath);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(fullPath, content, "utf-8");
      workspace.updatedAt = /* @__PURE__ */ new Date();
      this.saveWorkspaces();
      this.broadcastToWorkspace(id, {
        type: "fileChanged",
        path: filepath,
        content
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to save file" });
    }
  }
  async createFile(req, res) {
    try {
      const { id } = req.params;
      const { filepath, content = "", type = "file" } = req.body;
      const workspace = this.workspaces.get(id);
      if (!workspace) {
        res.status(404).json({ error: "Workspace not found" });
        return;
      }
      const fullPath = path.join(workspace.path, filepath);
      if (type === "directory") {
        fs.mkdirSync(fullPath, { recursive: true });
      } else {
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(fullPath, content, "utf-8");
      }
      workspace.updatedAt = /* @__PURE__ */ new Date();
      this.saveWorkspaces();
      this.broadcastToWorkspace(id, {
        type: "fileCreated",
        path: filepath,
        fileType: type
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to create file" });
    }
  }
  async deleteFile(req, res) {
    try {
      const { id } = req.params;
      const filepath = req.query.path;
      const workspace = this.workspaces.get(id);
      if (!workspace) {
        res.status(404).json({ error: "Workspace not found" });
        return;
      }
      const fullPath = path.join(workspace.path, filepath);
      if (!fs.existsSync(fullPath)) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      const stats = fs.statSync(fullPath);
      if (stats.isDirectory()) {
        fs.rmSync(fullPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(fullPath);
      }
      workspace.updatedAt = /* @__PURE__ */ new Date();
      this.saveWorkspaces();
      this.broadcastToWorkspace(id, {
        type: "fileDeleted",
        path: filepath
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete file" });
    }
  }
  async executeCommand(req, res) {
    var _a, _b;
    try {
      const { id } = req.params;
      const { command } = req.body;
      const workspace = this.workspaces.get(id);
      if (!workspace) {
        res.status(404).json({ error: "Workspace not found" });
        return;
      }
      const executionId = this.generateId();
      const execution = {
        id: executionId,
        workspaceId: id,
        command,
        status: "running",
        output: [],
        startTime: /* @__PURE__ */ new Date()
      };
      this.executions.set(executionId, execution);
      const commandParts = command.trim().split(/\s+/);
      const cmd = commandParts[0];
      const args = commandParts.slice(1);
      const childProcess = spawn(cmd, args, {
        cwd: workspace.path,
        stdio: ["pipe", "pipe", "pipe"]
      });
      execution.process = childProcess;
      (_a = childProcess.stdout) == null ? void 0 : _a.on("data", (data) => {
        const text = data.toString();
        execution.output.push(text);
        this.broadcastToWorkspace(id, {
          type: "executionOutput",
          executionId,
          data: text,
          stream: "stdout"
        });
      });
      (_b = childProcess.stderr) == null ? void 0 : _b.on("data", (data) => {
        const text = data.toString();
        execution.output.push(text);
        this.broadcastToWorkspace(id, {
          type: "executionOutput",
          executionId,
          data: text,
          stream: "stderr"
        });
      });
      childProcess.on("close", (code) => {
        execution.status = code === 0 ? "completed" : "error";
        execution.endTime = /* @__PURE__ */ new Date();
        delete execution.process;
        this.broadcastToWorkspace(id, {
          type: "executionComplete",
          executionId,
          status: execution.status,
          exitCode: code
        });
      });
      res.json({ executionId, status: "started" });
    } catch (error) {
      res.status(500).json({ error: "Failed to execute command" });
    }
  }
  async getExecutions(req, res) {
    try {
      const { id } = req.params;
      const executions = Array.from(this.executions.values()).filter((exec) => exec.workspaceId === id);
      res.json(executions);
    } catch (error) {
      res.status(500).json({ error: "Failed to get executions" });
    }
  }
  async killExecution(req, res) {
    try {
      const { executionId } = req.params;
      const execution = this.executions.get(executionId);
      if (!execution || !execution.process) {
        res.status(404).json({ error: "Execution not found or not running" });
        return;
      }
      execution.process.kill("SIGTERM");
      execution.status = "error";
      execution.endTime = /* @__PURE__ */ new Date();
      delete execution.process;
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to kill execution" });
    }
  }
  async decompileWxapkg(req, res) {
    try {
      const { id } = req.params;
      const workspace = this.workspaces.get(id);
      if (!workspace) {
        res.status(404).json({ error: "Workspace not found" });
        return;
      }
      const filesObj = req.files;
      const wxapkgFiles = (filesObj == null ? void 0 : filesObj.wxapkg) || [];
      if (!wxapkgFiles || wxapkgFiles.length === 0) {
        res.status(400).json({ error: "No wxapkg file(s) uploaded" });
        return;
      }
      let optionsObj = {};
      if (req.body.options) {
        try {
          const parsed = JSON.parse(req.body.options);
          if (Array.isArray(parsed)) {
            optionsObj = {
              clear: parsed.includes("--clear"),
              px: parsed.includes("--px"),
              unpackOnly: parsed.includes("--unpack-only"),
              wxid: null
            };
          } else {
            optionsObj = parsed;
          }
        } catch (error) {
          console.warn("Failed to parse options:", error);
        }
      }
      const isUnpackOnly = optionsObj.unpackOnly || false;
      workspace.unpackOnly = isUnpackOnly;
      this.saveWorkspaces();
      console.log(`[文件上传] 工作区 ${id} 上传了 ${wxapkgFiles.length} 个文件: ${wxapkgFiles.map((f) => f.originalname).join(", ")}`);
      res.json({
        success: true,
        message: `Successfully uploaded ${wxapkgFiles.length} file(s). Use batch decompile to process all files.`,
        fileCount: wxapkgFiles.length,
        files: wxapkgFiles.map((f) => f.originalname)
      });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Failed to upload files" });
    }
  }
  async updateWorkspaceAppInfo(req, res) {
    const workspaceId = req.params.id;
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      res.status(404).json({ error: "Workspace not found" });
      return;
    }
    try {
      const { appInfo } = req.body;
      workspace.appInfo = appInfo;
      workspace.updatedAt = /* @__PURE__ */ new Date();
      this.saveWorkspaces();
      res.json({
        success: true,
        message: "App info updated successfully",
        appInfo: workspace.appInfo
      });
    } catch (error) {
      console.error("Update app info error:", error);
      res.status(500).json({ error: "Failed to update app info" });
    }
  }
  async downloadWorkspace(req, res) {
    var _a, _b;
    const workspaceId = req.params.id;
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      console.error(`[下载错误] 工作区未找到: ${workspaceId}`);
      res.status(404).json({ error: "Workspace not found" });
      return;
    }
    try {
      let outputPath = path.join(workspace.path, "OUTPUT");
      let folderType = "OUTPUT";
      if (!fs.existsSync(outputPath)) {
        outputPath = path.join(workspace.path, "decompiled");
        folderType = "decompiled";
      }
      console.log(`[下载] 检查输出路径: ${outputPath} (${folderType})`);
      if (!fs.existsSync(outputPath)) {
        console.error(`[下载错误] 反编译结果文件夹不存在: ${outputPath}`);
        if (!fs.existsSync(workspace.path)) {
          console.error(`[下载错误] 工作区目录不存在: ${workspace.path}`);
          res.status(404).json({ error: "Workspace directory not found" });
          return;
        }
        try {
          const workspaceContents = fs.readdirSync(workspace.path);
          console.log(`[下载] 工作区目录内容: ${workspaceContents.join(", ")}`);
        } catch (err) {
          console.error(`[下载错误] 无法读取工作区目录: ${err}`);
        }
        res.status(404).json({ error: "Decompilation result folder not found. Please ensure decompilation completed successfully." });
        return;
      }
      try {
        const outputContents = fs.readdirSync(outputPath);
        console.log(`[下载] ${folderType}文件夹内容: ${outputContents.join(", ")}`);
        if (outputContents.length === 0) {
          console.error(`[下载错误] ${folderType}文件夹为空: ${outputPath}`);
          res.status(404).json({ error: `${folderType} folder is empty. Please ensure decompilation completed successfully.` });
          return;
        }
      } catch (err) {
        console.error(`[下载错误] 无法读取${folderType}文件夹: ${err}`);
        res.status(500).json({ error: `Cannot read ${folderType} folder` });
        return;
      }
      let fileName = "反编译结果";
      console.log(`[下载调试] workspace.appInfo:`, workspace.appInfo);
      if (workspace.appInfo) {
        console.log(`[下载调试] 找到appInfo，nickname: ${workspace.appInfo.nickname}, username: ${workspace.appInfo.username}, appid: ${workspace.appInfo.appid}`);
        if (workspace.appInfo.nickname) {
          fileName = workspace.appInfo.nickname;
          console.log(`[下载调试] 使用nickname作为文件名: ${fileName}`);
        } else if (workspace.appInfo.username) {
          fileName = workspace.appInfo.username;
          console.log(`[下载调试] 使用username作为文件名: ${fileName}`);
        } else if (workspace.appInfo.appid) {
          fileName = workspace.appInfo.appid;
          console.log(`[下载调试] 使用appid作为文件名: ${fileName}`);
        }
      } else {
        console.log(`[下载调试] 没有找到appInfo，使用默认文件名: ${fileName}`);
      }
      if (workspace.unpackOnly) {
        fileName += "-仅解包";
      }
      fileName = fileName.replace(/[<>:"/\\|?*]/g, "_");
      const now = /* @__PURE__ */ new Date();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      const hours = String(now.getHours()).padStart(2, "0");
      const minutes = String(now.getMinutes()).padStart(2, "0");
      const seconds = String(now.getSeconds()).padStart(2, "0");
      const timestamp = `${month}${day}-${hours}${minutes}${seconds}`;
      const zipFileName = `${fileName}_${timestamp}.zip`;
      const zipPath = path.join(this.uploadsDir, zipFileName);
      console.log(`[下载] 创建压缩包: ${zipFileName}`);
      console.log(`[下载] 压缩包路径: ${zipPath}`);
      const zipProcess = spawn("zip", ["-r", zipPath, "."], {
        cwd: outputPath,
        stdio: "pipe"
      });
      let zipOutput = "";
      let zipError = "";
      (_a = zipProcess.stdout) == null ? void 0 : _a.on("data", (data) => {
        zipOutput += data.toString();
      });
      (_b = zipProcess.stderr) == null ? void 0 : _b.on("data", (data) => {
        zipError += data.toString();
      });
      zipProcess.on("close", (code) => {
        console.log(`[下载] zip进程退出码: ${code}`);
        if (zipOutput) console.log(`[下载] zip输出: ${zipOutput}`);
        if (zipError) console.error(`[下载] zip错误: ${zipError}`);
        if (code === 0 && fs.existsSync(zipPath)) {
          const zipStats = fs.statSync(zipPath);
          console.log(`[下载] 压缩包创建成功，大小: ${zipStats.size} bytes`);
          res.setHeader("Content-Type", "application/zip");
          res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(zipFileName)}"`);
          res.setHeader("Content-Length", zipStats.size.toString());
          const fileStream = fs.createReadStream(zipPath);
          fileStream.pipe(res);
          fileStream.on("end", () => {
            console.log(`[下载] 文件发送完成，清理临时文件: ${zipPath}`);
            fs.unlink(zipPath, (err) => {
              if (err) console.error("Failed to delete temp zip file:", err);
            });
          });
          fileStream.on("error", (err) => {
            console.error(`[下载错误] 文件流错误: ${err}`);
            res.status(500).json({ error: "File stream error" });
          });
        } else {
          console.error(`[下载错误] 压缩包创建失败，退出码: ${code}, 文件存在: ${fs.existsSync(zipPath)}`);
          res.status(500).json({ error: `Failed to create zip file. Exit code: ${code}` });
        }
      });
      zipProcess.on("error", (error) => {
        console.error(`[下载错误] zip进程错误: ${error}`);
        res.status(500).json({ error: `Zip process error: ${error.message}` });
      });
    } catch (error) {
      console.error(`[下载错误] 下载异常: ${error}`);
      res.status(500).json({ error: `Failed to download workspace: ${error instanceof Error ? error.message : "Unknown error"}` });
    }
  }
  async compileFolderWxapkg(req, res) {
    var _a, _b;
    try {
      const { id } = req.params;
      const workspace = this.workspaces.get(id);
      if (!workspace) {
        res.status(404).json({ error: "Workspace not found" });
        return;
      }
      const { folderPath, options = [] } = req.body;
      if (!folderPath) {
        res.status(400).json({ error: "Folder path is required" });
        return;
      }
      const fullFolderPath = path.resolve(folderPath);
      if (!fs.existsSync(fullFolderPath)) {
        res.status(400).json({ error: "Folder path does not exist" });
        return;
      }
      const stats = fs.statSync(fullFolderPath);
      if (!stats.isDirectory()) {
        res.status(400).json({ error: "Path is not a directory" });
        return;
      }
      let parsedOptions = [];
      if (Array.isArray(options)) {
        parsedOptions = options;
      }
      const isUnpackOnly = parsedOptions.includes("--unpack-only");
      workspace.unpackOnly = isUnpackOnly;
      this.saveWorkspaces();
      const executionId = this.generateId();
      const outputPath = path.join(workspace.path, "OUTPUT");
      if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true });
      }
      const command = [
        process.execPath,
        "dist/wedecode.js",
        fullFolderPath,
        "--out",
        outputPath,
        "--clear",
        ...parsedOptions
      ];
      const execution = {
        id: executionId,
        workspaceId: id,
        command: command.join(" "),
        status: "running",
        output: [],
        startTime: /* @__PURE__ */ new Date()
      };
      this.executions.set(executionId, execution);
      const childProcess = spawn(command[0], command.slice(1), {
        cwd: path.join(__dirname$1, "../.."),
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...define_process_env_default,
          WEDECODE_CHILD_PROCESS: "true"
          // 标识这是一个子进程
        }
      });
      execution.process = childProcess;
      (_a = childProcess.stdout) == null ? void 0 : _a.on("data", (data) => {
        const output = data.toString();
        execution.output.push(output);
        console.log(`[文件夹编译进程] ${output.trim()}`);
        this.broadcastToWorkspace(id, {
          type: "execution",
          executionId,
          event: "output",
          data: output
        });
      });
      (_b = childProcess.stderr) == null ? void 0 : _b.on("data", (data) => {
        const output = data.toString();
        execution.output.push(output);
        console.error(`[文件夹编译进程错误] ${output.trim()}`);
        this.broadcastToWorkspace(id, {
          type: "execution",
          executionId,
          event: "error",
          data: output
        });
      });
      childProcess.on("close", (code) => {
        execution.status = code === 0 ? "completed" : "error";
        execution.endTime = /* @__PURE__ */ new Date();
        if (code === 0) {
          console.log(`[文件夹编译进程] 编译完成，退出码: ${code}`);
        } else {
          console.error(`[文件夹编译进程] 编译失败，退出码: ${code}`);
        }
        this.broadcastToWorkspace(id, {
          type: "execution",
          executionId,
          event: "exit",
          code
        });
      });
      childProcess.on("error", (error) => {
        execution.status = "error";
        execution.endTime = /* @__PURE__ */ new Date();
        console.error(`[文件夹编译进程] 进程错误: ${error.message}`);
        this.broadcastToWorkspace(id, {
          type: "execution",
          executionId,
          event: "error",
          data: error.message
        });
      });
      res.json({
        success: true,
        executionId,
        message: "Folder compilation started"
      });
    } catch (error) {
      console.error("Folder compilation error:", error);
      res.status(500).json({ error: "Failed to start folder compilation" });
    }
  }
  async batchDecompileWorkspace(req, res) {
    var _a, _b;
    const id = req.params.id;
    const workspace = this.workspaces.get(id);
    if (!workspace) {
      res.status(404).json({ error: "Workspace not found" });
      return;
    }
    try {
      const { options = {} } = req.body;
      let parsedOptions = [];
      try {
        const optionsObj = typeof options === "string" ? JSON.parse(options) : options;
        if (optionsObj.px) parsedOptions.push("--px");
        if (optionsObj.unpackOnly) parsedOptions.push("--unpack-only");
        if (optionsObj.wxid) parsedOptions.push("--wxid", optionsObj.wxid);
        if (optionsObj.clear) parsedOptions.push("--clear");
      } catch (error) {
        console.warn("Failed to parse options:", error);
      }
      const workspaceUploadDir = path.join(workspace.path, "uploads");
      if (!fs.existsSync(workspaceUploadDir)) {
        res.status(400).json({ error: "No uploaded files found in workspace" });
        return;
      }
      const wxapkgFiles = fs.readdirSync(workspaceUploadDir).filter((file) => file.endsWith(".wxapkg")).map((file) => path.join(workspaceUploadDir, file));
      if (wxapkgFiles.length === 0) {
        res.status(400).json({ error: "No .wxapkg files found in workspace" });
        return;
      }
      console.log(`[批量反编译] 工作区 ${id} 找到 ${wxapkgFiles.length} 个文件:`, wxapkgFiles.map((f) => path.basename(f)));
      const outputPath = path.join(workspace.path, "OUTPUT");
      if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true });
      }
      const executionId = this.generateId();
      const command = [
        process.execPath,
        "dist/wedecode.js",
        workspaceUploadDir,
        "--out",
        outputPath,
        "--clear",
        ...parsedOptions
      ];
      console.log("执行命令:", command.join(" "));
      const execution = {
        id: executionId,
        workspaceId: id,
        command: command.join(" "),
        status: "running",
        output: [],
        startTime: /* @__PURE__ */ new Date()
      };
      this.executions.set(executionId, execution);
      console.log(`[批量反编译] 启动命令: ${command.join(" ")}`);
      const childProcess = spawn(command[0], command.slice(1), {
        cwd: path.join(__dirname$1, "../.."),
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...define_process_env_default,
          WEDECODE_CHILD_PROCESS: "true"
          // 标识这是一个子进程
        }
      });
      execution.process = childProcess;
      (_a = childProcess.stdout) == null ? void 0 : _a.on("data", (data) => {
        const output = data.toString();
        execution.output.push(output);
        console.log(`[批量反编译进程] ${output.trim()}`);
        this.broadcastToWorkspace(id, {
          type: "execution",
          executionId,
          event: "output",
          data: output
        });
      });
      (_b = childProcess.stderr) == null ? void 0 : _b.on("data", (data) => {
        const output = data.toString();
        execution.output.push(output);
        console.error(`[批量反编译进程错误] ${output.trim()}`);
        this.broadcastToWorkspace(id, {
          type: "execution",
          executionId,
          event: "error",
          data: output
        });
      });
      childProcess.on("close", (code) => {
        execution.status = code === 0 ? "completed" : "error";
        execution.endTime = /* @__PURE__ */ new Date();
        if (code === 0) {
          console.log(`[批量反编译进程] 批量反编译完成，退出码: ${code}`);
        } else {
          console.error(`[批量反编译进程] 批量反编译失败，退出码: ${code}`);
        }
        this.broadcastToWorkspace(id, {
          type: "execution",
          executionId,
          event: "exit",
          code
        });
      });
      childProcess.on("error", (error) => {
        execution.status = "error";
        execution.endTime = /* @__PURE__ */ new Date();
        console.error(`[批量反编译进程] 进程错误: ${error.message}`);
        this.broadcastToWorkspace(id, {
          type: "execution",
          executionId,
          event: "error",
          data: error.message
        });
      });
      res.json({
        success: true,
        executionId,
        message: `Batch decompilation started for ${wxapkgFiles.length} files`,
        fileCount: wxapkgFiles.length
      });
    } catch (error) {
      console.error("Batch decompilation error:", error);
      res.status(500).json({ error: "Failed to start batch decompilation" });
    }
  }
}
export {
  WorkspaceServer as W
};
