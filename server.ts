import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;
const BIOMAX_URL = process.env.BIOMAX_API_URL || "http://43.225.52.40:81";

app.use(express.json());

// Proxy for Biomax API to handle CORS and centralize auth
app.all("/api/biomax/*", async (req, res) => {
  const path = req.params[0];
  const method = req.method;
  
  // Use dynamic URL from header if provided, otherwise fallback to default
  const dynamicUrl = req.headers["x-biomax-url"] as string;
  const baseUrl = dynamicUrl || BIOMAX_URL;
  const targetUrl = `${baseUrl}/api/${path}`;

  try {
    const response = await axios({
      url: targetUrl,
      method,
      data: req.body,
      params: req.query,
      headers: {
        ...req.headers,
        host: new URL(baseUrl).host,
        // Forward authorization if present
        ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
      },
      timeout: 30000,
    });

    res.status(response.status).json(response.data);
  } catch (error: any) {
    console.error(`Biomax Proxy Error [${method}] ${path}:`, error.message);
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Biomax Target: ${BIOMAX_URL}`);
  });
}

startServer();
