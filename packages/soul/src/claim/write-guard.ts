const CLAIM_FIELD_PATTERN =
  /\b(claim_draft|claim_confidence|claim_gist|claim_mode|claim_source)\b/i;

export const CHECKPOINT_CLAIM_WRITE_MARKER = 'checkpoint_claim_write';

export function shouldWarnClaimWrite(sql: string): boolean {
  return CLAIM_FIELD_PATTERN.test(sql) && !sql.includes(CHECKPOINT_CLAIM_WRITE_MARKER);
}
