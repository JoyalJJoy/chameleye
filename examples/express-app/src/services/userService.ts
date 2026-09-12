import { UserRepository } from "../repositories/userRepository";
const repo = new UserRepository();
export class UserService {
  async createUser(data: any) { this.validate(data); return repo.create(data); }
  validate(data: any) { if(!data.email) throw new Error("email"); }
}
