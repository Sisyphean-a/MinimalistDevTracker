function createStorageWriter() {
  const queueByKey = new Map();

  function run(key, task) {
    const previous = queueByKey.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    queueByKey.set(
      key,
      next.finally(() => {
        if (queueByKey.get(key) === next) {
          queueByKey.delete(key);
        }
      })
    );
    return next;
  }

  return Object.freeze({
    run
  });
}

module.exports = {
  createStorageWriter
};
