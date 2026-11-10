import app from "./app";

// Cổng 3000 hay bị các project khác (Next.js, React...) chiếm → dùng 4000 mặc định.
// Nếu đổi, nhớ đổi cả BEBOOK_API_PORT bên frontend (vite.config.ts).
const PORT = Number(process.env.PORT) || 4000;

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `❌ Port ${PORT} is already in use by another app. Stop that app or run with another port, e.g. PORT=4001 npm run dev (and set BEBOOK_API_PORT=4001 for the frontend).`
    );
    process.exit(1);
  }
  throw err;
});
