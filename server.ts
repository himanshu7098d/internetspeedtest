import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import crypto from "crypto";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload limit for upload test
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // --- Speed Test Endpoints ---

  // Ping endpoint
  app.get("/api/ping", (req, res) => {
    res.status(200).send("pong");
  });

  // Download endpoint: Generates random data to send to the client
  app.get("/api/download", (req, res) => {
    const sizeInBytes = parseInt(req.query.size as string) || 10 * 1024 * 1024; // Default 10MB
    // Cap at 50MB to prevent abuse
    const safeSize = Math.min(sizeInBytes, 50 * 1024 * 1024);
    
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Content-Length', safeSize.toString());

    // Send random data in chunks
    const chunkSize = 1024 * 1024; // 1MB chunks
    let bytesSent = 0;

    const sendChunk = () => {
      if (bytesSent < safeSize) {
        const remaining = safeSize - bytesSent;
        const currentChunkSize = Math.min(chunkSize, remaining);
        const chunk = crypto.randomBytes(currentChunkSize);
        
        const canContinue = res.write(chunk);
        bytesSent += currentChunkSize;

        if (canContinue) {
          setImmediate(sendChunk);
        } else {
          res.once('drain', sendChunk);
        }
      } else {
        res.end();
      }
    };

    sendChunk();
  });

  // Upload endpoint: Receives data from the client
  app.post("/api/upload", (req, res) => {
    // We don't actually need to do anything with the data, just receive it
    res.status(200).json({ success: true, receivedBytes: req.headers['content-length'] });
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
