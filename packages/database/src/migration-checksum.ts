import { createHash } from 'node:crypto';

/**
 * Line endings are not content: a Windows checkout (CRLF) and a Linux runner (LF)
 * must produce the same checksum, otherwise every applied migration looks edited
 * and the migration tool refuses to run on Windows.
 */
export function checksumOf(sql: string): string {
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
}
