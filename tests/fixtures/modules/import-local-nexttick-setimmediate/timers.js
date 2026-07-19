export function setImmediate(callback, ...args) {
    __jsbinNextTick(callback);
}
