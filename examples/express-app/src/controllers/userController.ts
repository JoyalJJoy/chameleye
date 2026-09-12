import { UserService } from "../services/userService";
const svc = new UserService();
export async function createUserHandler(req: any, res: any) {
  const user = await svc.createUser(req.body);
  res.json(user);
}
