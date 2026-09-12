import { query } from "../db/postgres";
export class UserRepository {
  async create(data: any) { return query("INSERT INTO users ...", [data]); }
  async findById(id: string) { return query("SELECT * FROM users WHERE id=$1", [id]); }
}
