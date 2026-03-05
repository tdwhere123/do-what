export class RevisionCounter {
  private count: number;

  constructor(initialValue = 0) {
    // TODO(T007): initialize from `SELECT COALESCE(MAX(revision), 0) FROM event_log`
    // when migration/bootstrap wiring is available to avoid duplicate revisions after restart.
    this.count = initialValue;
  }

  next(): number {
    this.count += 1;
    return this.count;
  }
}
