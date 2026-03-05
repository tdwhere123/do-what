export class RevisionCounter {
  private count: number;

  constructor(initialValue = 0) {
    this.count = initialValue;
  }

  next(): number {
    this.count += 1;
    return this.count;
  }
}
