const PREFIX = "[9Router-Bridge]";

export const logger = {
  info(...args) {
    console.log(PREFIX, ...args);
  },
  warn(...args) {
    console.warn(PREFIX, ...args);
  },
  error(...args) {
    console.error(PREFIX, ...args);
  },
  debug(...args) {
    console.debug(PREFIX, ...args);
  },
};
