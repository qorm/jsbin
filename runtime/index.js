// JSBin 运行时导出
// 统一导出所有运行时组件

// 核心组件
export { AllocatorGenerator } from "./core/allocator.js";
export * from "./core/allocator.js";
export { PrintGenerator } from "./core/print.js";
export { RUNTIME_STRINGS, StringConstantsGenerator } from "./core/strings.js";

// 类型运行时 - Number (包含所有数值子类型)
export { NumberGenerator } from "./types/number/index.js";
export * from "./types/number/types.js"; // 导出所有 Number 类型常量
// 类型运行时 - 其他类型
export { StringGenerator } from "./types/string/index.js";
export { ArrayGenerator } from "./types/array/index.js";
export { TypedArrayGenerator, ArrayBufferGenerator } from "./types/typedarray/index.js";
export * from "./types/typedarray/index.js"; // 导出 TypedArray 类型常量
export { ObjectGenerator } from "./types/object/index.js";
export { MapGenerator } from "./types/map/index.js";
export { SetGenerator } from "./types/set/index.js";
export { DateGenerator } from "./types/date/index.js";
export { RegExpGenerator } from "./types/regexp/index.js";

// 运算符
export { TypeofGenerator } from "./operators/typeof.js";

// 下标访问
export { SubscriptGenerator } from "./core/subscript.js";

// 异步运行时
export { AsyncGenerator, CoroutineGenerator, PromiseGenerator } from "./async/index.js";

// 统一运行时生成器
import { NumberGenerator } from "./types/number/index.js";
import { StringGenerator } from "./types/string/index.js";
import { ArrayGenerator } from "./types/array/index.js";
import { TypedArrayGenerator, ArrayBufferGenerator } from "./types/typedarray/index.js";
import { ObjectGenerator } from "./types/object/index.js";
import { MapGenerator } from "./types/map/index.js";
import { SetGenerator } from "./types/set/index.js";
import { DateGenerator } from "./types/date/index.js";
import { RegExpGenerator } from "./types/regexp/index.js";
import { PrintGenerator } from "./core/print.js";
import { SubscriptGenerator } from "./core/subscript.js";
import { TypeofGenerator } from "./operators/typeof.js";
import { AsyncGenerator } from "./async/index.js";

export class RuntimeGenerator {
    constructor(vm, ctx) {
        this.vm = vm;
        this.ctx = ctx;
        // 类型生成器
        this.numberGen = new NumberGenerator(vm, ctx);
        this.stringGen = new StringGenerator(vm);
        this.arrayGen = new ArrayGenerator(vm);
        this.typedArrayGen = new TypedArrayGenerator(vm, ctx);
        this.arrayBufferGen = new ArrayBufferGenerator(vm, ctx);
        this.objectGen = new ObjectGenerator(vm);
        this.mapGen = new MapGenerator(vm);
        this.setGen = new SetGenerator(vm);
        this.dateGen = new DateGenerator(vm);
        this.regexpGen = new RegExpGenerator(vm);
        // 核心生成器
        this.printGen = new PrintGenerator(vm);
        this.subscriptGen = new SubscriptGenerator(vm, ctx);
        this.typeofGen = new TypeofGenerator(vm);
        // 异步运行时
        this.asyncGen = new AsyncGenerator(vm);
    }

    // 生成所有运行时函数
    generate() {
        // 类型
        this.numberGen.generate();
        this.stringGen.generate();
        this.arrayGen.generate();
        this.typedArrayGen.generate();
        this.arrayBufferGen.generate();
        this.objectGen.generate();
        this.mapGen.generate();
        this.setGen.generate();
        this.dateGen.generate();
        this.regexpGen.generate();
        // 核心
        this.printGen.generate();
        this.subscriptGen.generate();
        this.typeofGen.generate();
        // 异步
        this.asyncGen.generate();
    }

    // 生成异步运行时数据段
    generateAsyncDataSection(asm) {
        this.asyncGen.generateDataSection(asm);
    }
}

// 运行时配置
let heapSize = 1048576; // 默认 1MB
let maxHeapSize = 0; // 0 = 无限制
let numWorkers = 0; // 0 = 单线程

export function getHeapSize() {
    return heapSize;
}

export function setHeapSize(size) {
    heapSize = size;
}

export function getMaxHeapSize() {
    return maxHeapSize;
}

export function setMaxHeapSize(size) {
    maxHeapSize = size;
}

export function getNumWorkers() {
    return numWorkers;
}

export function setNumWorkers(n) {
    numWorkers = n;
}
