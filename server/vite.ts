import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createVite, createLogger } from "vite";
import { type Server } from "http";
import config from "../vite.config";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
  });
  const id = nanoid(5);
  viteLogger.info(`[${formattedTime}][${source}:${id}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const vite = await createVite({
    ...config,
    server: { middlewareMode: true, hmr: { server } },
    appType: "custom",
    optimizeDeps: { entries: ["client/index.html"] },
  });

  app.use(vite.middlewares);

  app.use("*", async (req, res, next) => {
    try {
      const url = req.originalUrl;
      const indexHtml = fs.readFileSync(path.resolve("client/index.html"), "utf-8");
      const transformed = await vite.transformIndexHtml(url, indexHtml);
      res.status(200).set({ "Content-Type": "text/html" }).end(transformed);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve("dist/public");
  if (!fs.existsSync(distPath)) {
    throw new Error(`Could not find the build directory: ${distPath}, build the client first`);
  }
  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
