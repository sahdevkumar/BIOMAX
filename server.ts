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
app.all(["/api/biomax/*", "/api/biometric/*"], async (req, res) => {
  const path = req.params[0];
  const method = req.method;
  
  // Handle the case where the path might start with /api/ again from the frontend
  const cleanPath = path.startsWith("api/") ? path.substring(4) : path;
  const targetUrl = `${BIOMAX_URL}/api/${cleanPath}`;

  console.log(`[Proxy] ${method} ${req.url} -> ${targetUrl}`);

  try {
    const response = await axios({
      url: targetUrl,
      method,
      data: req.body,
      params: req.query,
      validateStatus: () => true, // Pass through all status codes
      headers: {
        'Accept': '*/*',
        'Content-Type': 'application/json',
        // Forward authorization if present
        ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
      },
      timeout: 30000,
    });

    console.log(`[Proxy] Response: ${response.status}`);
    res.status(response.status).json(response.data);
  } catch (error: any) {
    console.error(`[Proxy] Error [${method}] ${path}:`, error.message);
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
