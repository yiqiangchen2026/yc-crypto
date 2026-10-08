// Serialize whole scans, including network waits and alert state transitions.
export class SerialScan {
  constructor(execute) { this.execute = execute; this.tail = Promise.resolve(); }
  run(job) {
    const task = this.tail.then(() => this.execute(job));
    this.tail = task.catch(() => {});
    return task;
  }
}
