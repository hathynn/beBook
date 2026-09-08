import express from "express";
import cors from "cors";

import testRoute from "./routes/test.route";
import novelRoute from "./routes/novel.route";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/test", testRoute);
app.use("/api/novel", novelRoute);

export default app;