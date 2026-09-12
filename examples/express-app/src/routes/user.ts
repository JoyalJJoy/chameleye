import { Router } from "express";
import { createUserHandler } from "../controllers/userController";
const router = Router();
router.post("/api/users", createUserHandler);
export default router;
