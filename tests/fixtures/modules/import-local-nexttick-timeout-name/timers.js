export function setTimeout(callback, delay, ...args) {
    __jsbinNextTick(callback);
}
