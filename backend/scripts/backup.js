// Takes a full backup of the database with pg_dump (NFR10).
//
//   npm run db:backup -w backend
//
// Writes backups/smart_expense-<timestamp>.dump in pg_dump's custom format,
// checks the file can be read back, and keeps only the newest BACKUP_KEEP
// backups (default 14). Backups hold financial data and password hashes, so the
// folder and files are readable by the owner only.

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

const databaseUrl = process.env.DATABASE_URL;
const backupDir = path.resolve(
  process.env.BACKUP_DIR ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '../../backups'),
);
const keep = Number.parseInt(process.env.BACKUP_KEEP ?? '14', 10);
const PREFIX = 'smart_expense-';

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
}

async function pruneOldBackups() {
  const files = (await fs.readdir(backupDir))
    .filter((name) => name.startsWith(PREFIX) && name.endsWith('.dump'))
    .sort()
    .reverse();
  for (const name of files.slice(keep)) {
    await fs.unlink(path.join(backupDir, name));
    console.log(`Removed old backup ${name}`);
  }
}

async function main() {
  if (!databaseUrl) throw new Error('DATABASE_URL is not set');
  if (!Number.isInteger(keep) || keep < 1) throw new Error('BACKUP_KEEP must be at least 1');

  await fs.mkdir(backupDir, { recursive: true, mode: 0o700 });
  const finalPath = path.join(backupDir, `${PREFIX}${timestamp()}.dump`);
  // Written under a temporary name first, so an interrupted backup never looks
  // like a complete one.
  const partialPath = `${finalPath}.partial`;

  await run('pg_dump', ['--format=custom', '--no-owner', `--file=${partialPath}`, databaseUrl]);
  await fs.chmod(partialPath, 0o600);

  // A backup that cannot be listed cannot be restored, so treat it as a failure.
  const { stdout } = await run('pg_restore', ['--list', partialPath]);
  const tableCount = stdout.split('\n').filter((line) => / TABLE DATA /.test(line)).length;

  await fs.rename(partialPath, finalPath);
  const { size } = await fs.stat(finalPath);
  console.log(`Backup written: ${finalPath}`);
  console.log(`Size: ${(size / 1024).toFixed(1)} KB, tables with data: ${tableCount}`);

  await pruneOldBackups();
}

main().catch((err) => {
  // pg_dump errors can include the connection string, so print only the cause.
  console.error(`Backup failed: ${err.stderr?.trim() || err.message}`.replaceAll(databaseUrl ?? '', '<DATABASE_URL>'));
  process.exitCode = 1;
});
