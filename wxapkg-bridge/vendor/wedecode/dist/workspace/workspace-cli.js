#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { W as WorkspaceServer } from "./workspace-server.js";
import { Command } from "commander";
import "express";
import "cors";
import "multer";
import "ws";
import "node:http";
import "node:child_process";
import "url";
var define_process_env_default = {};
const program = new Command();
program.name("wedecode-workspace").description("Wedecode 工作区服务器").version("1.0.0");
program.command("start").description("启动工作区服务器").option("-p, --port <port>", "服务器端口", "3000").option("-w, --workspace-dir <dir>", "工作区目录", "./workspaces").action(async (options) => {
  const port = parseInt(options.port);
  const workspaceDir = path.resolve(options.workspaceDir);
  define_process_env_default.WORKSPACE_ROOT = workspaceDir;
  console.log("🚀 启动 Wedecode 工作区服务器...");
  console.log(`📁 工作区目录: ${workspaceDir}`);
  console.log(`🌐 端口: ${port}`);
  if (!fs.existsSync(workspaceDir)) {
    fs.mkdirSync(workspaceDir, { recursive: true });
  }
  new WorkspaceServer(port);
});
if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
}
