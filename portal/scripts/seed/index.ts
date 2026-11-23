import { sqlite } from "./db";
import { seedBase } from "./base";
import { seedProcess } from "./process";
import { seedBoard } from "./board";

const existing = sqlite.prepare("select count(*) as n from users").get() as { n: number };
if (existing.n > 0) {
  console.log("The database already has data. Run `npm run db:reset` to start again.");
  process.exit(0);
}

// The audit log is append-only: block edits and deletes at the database level.
sqlite.exec(`
  CREATE TRIGGER IF NOT EXISTS audit_log_no_update BEFORE UPDATE ON audit_log
  BEGIN SELECT RAISE(ABORT, 'The audit log cannot be edited.'); END;
  CREATE TRIGGER IF NOT EXISTS audit_log_no_delete BEFORE DELETE ON audit_log
  BEGIN SELECT RAISE(ABORT, 'The audit log cannot be edited.'); END;
`);

const run = sqlite.transaction(() => {
  const ctx = seedBase();
  seedProcess(ctx);
  seedBoard(ctx);
});
run();
console.log("Seeded demo data. Every demo account's password is Demo@1234.");
