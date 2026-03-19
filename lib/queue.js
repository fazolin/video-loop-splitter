/**
 * Simple promise-based queue for parallel task execution
 */
class Queue {
  constructor(workers = 2) {
    this.workers = workers;
    this.tasks = [];
    this.activeCount = 0;
  }

  /**
   * Add a task to the queue
   * @param {Function} task - Async function to execute
   * @returns {Promise} Promise that resolves when task completes
   */
  add(task) {
    return new Promise((resolve, reject) => {
      this.tasks.push({ task, resolve, reject });
      this.process();
    });
  }

  /**
   * Process tasks from queue
   */
  process() {
    while (this.activeCount < this.workers && this.tasks.length > 0) {
      this.activeCount++;
      const { task, resolve, reject } = this.tasks.shift();

      Promise.resolve()
        .then(() => task())
        .then(resolve)
        .catch(reject)
        .finally(() => {
          this.activeCount--;
          this.process();
        });
    }
  }

  /**
   * Wait for all tasks to complete
   */
  async drain() {
    while (this.activeCount > 0 || this.tasks.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
}

module.exports = Queue;
