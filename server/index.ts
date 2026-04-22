
import express from "express";
import { registerRoutes } from "./routes.js";
import { setupVite, serveStatic, log } from "./vite";
import { registerKnowledgeRoutes } from "./knowledge.routes";
(async () => {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // Simple request logger
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJson: any;
    const json = res.json.bind(res);
    res.json = (body: any) => { capturedJson = body; return json(body); };
    res.on("finish", () => {
      const ms = Date.now() - start;
      log(`${req.method} ${path} -> ${res.statusCode} in ${ms}ms`);
      if (process.env.NODE_ENV === "development" && path.startsWith("/api/")) {
        log(`response: ${JSON.stringify(capturedJson)?.slice(0, 400)}...`);
      }
    });
    next();
  });

  const server = await registerRoutes(app);

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
registerKnowledgeRoutes(app);
  server.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
    log(`serving on port ${port}`);
  });
})();

