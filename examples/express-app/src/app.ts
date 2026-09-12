import express from "express";
import userRoutes from "./routes/user";
const app = express();
app.use(express.json());
app.use(userRoutes);
app.get("/health", (req, res) => res.send("ok"));
export default app;
