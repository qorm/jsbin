// JSBin 数组运行时
// 提供数组操作函数
//
// 数组布局 (24 bytes header + elements):
//   offset 0:  type (8 bytes) - TYPE_ARRAY = 1
//   offset 8:  length (8 bytes) - 当前元素数量
//   offset 16: capacity (8 bytes) - 最大容量
//   offset 24: elements[0]
//   offset 32: elements[1]
//   ...
//
// 最小容量: MIN_CAPACITY = 8
// 扩容策略: newCap = oldCap * 2

import { VReg } from "../../../vm/registers.js";

const ARRAY_HEADER_SIZE = 24;
const ARRAY_MIN_CAPACITY = 8;

export class ArrayGenerator {
    constructor(vm) {
        this.vm = vm;
    }

    // 数组 push（带容量检查和自动扩容）
    // _array_push(arr, value) -> 数组指针（扩容后可能变化）
    generateArrayPush() {
        const vm = this.vm;

        vm.label("_array_push");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // arr
        vm.mov(VReg.S1, VReg.A1); // value

        // 获取当前长度和容量
        vm.load(VReg.S2, VReg.S0, 8); // length
        vm.load(VReg.S3, VReg.S0, 16); // capacity

        // 检查是否需要扩容: if (length >= capacity)
        vm.cmp(VReg.S2, VReg.S3);
        vm.jlt("_array_push_no_grow");

        // === 需要扩容 ===
        // 新容量 = 旧容量 * 2
        vm.shl(VReg.S4, VReg.S3, 1); // newCap = cap * 2

        // 分配新数组: 24 (header) + newCap * 8
        vm.shl(VReg.A0, VReg.S4, 3);
        vm.addImm(VReg.A0, VReg.A0, ARRAY_HEADER_SIZE);
        vm.call("_alloc");

        // V0 = 新数组指针
        vm.mov(VReg.V0, VReg.RET);

        // 设置新数组头
        vm.movImm(VReg.V1, 1); // TYPE_ARRAY
        vm.store(VReg.V0, 0, VReg.V1);
        vm.store(VReg.V0, 8, VReg.S2); // length (保持不变)
        vm.store(VReg.V0, 16, VReg.S4); // newCapacity

        // 复制元素 (i = 0 to length)
        vm.movImm(VReg.V2, 0); // i = 0

        vm.label("_array_push_copy_loop");
        vm.cmp(VReg.V2, VReg.S2);
        vm.jge("_array_push_copy_done");

        // src = old[24 + i * 8]
        vm.shl(VReg.V3, VReg.V2, 3);
        vm.addImm(VReg.V3, VReg.V3, ARRAY_HEADER_SIZE);
        vm.add(VReg.V3, VReg.S0, VReg.V3);
        vm.load(VReg.V4, VReg.V3, 0);

        // dst = new[24 + i * 8]
        vm.shl(VReg.V3, VReg.V2, 3);
        vm.addImm(VReg.V3, VReg.V3, ARRAY_HEADER_SIZE);
        vm.add(VReg.V3, VReg.V0, VReg.V3);
        vm.store(VReg.V3, 0, VReg.V4);

        vm.addImm(VReg.V2, VReg.V2, 1);
        vm.jmp("_array_push_copy_loop");

        vm.label("_array_push_copy_done");
        // 使用新数组
        vm.mov(VReg.S0, VReg.V0);

        vm.label("_array_push_no_grow");
        // 计算元素偏移: 24 + length * 8
        vm.shl(VReg.V0, VReg.S2, 3);
        vm.addImm(VReg.V0, VReg.V0, ARRAY_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);

        // 存储值
        vm.store(VReg.V0, 0, VReg.S1);

        // 更新长度
        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.store(VReg.S0, 8, VReg.S2);

        // 返回数组指针（如果扩容则是新数组，否则是原数组）
        vm.mov(VReg.RET, VReg.S0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 32);
    }

    // 数组 pop
    // _array_pop(arr) -> value
    generateArrayPop() {
        const vm = this.vm;

        vm.label("_array_pop");
        vm.prologue(16, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0); // arr

        // 获取当前长度
        vm.load(VReg.S1, VReg.S0, 8);

        // 检查是否为空
        vm.cmpImm(VReg.S1, 0);
        vm.jeq("_array_pop_empty");

        // 减少长度
        vm.subImm(VReg.S1, VReg.S1, 1);
        vm.store(VReg.S0, 8, VReg.S1);

        // 获取最后一个元素: 24 + (length-1) * 8
        vm.shl(VReg.V0, VReg.S1, 3);
        vm.addImm(VReg.V0, VReg.V0, ARRAY_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.load(VReg.RET, VReg.V0, 0);
        vm.epilogue([VReg.S0, VReg.S1], 16);

        vm.label("_array_pop_empty");
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1], 16);
    }

    // 数组 get
    // _array_get(arr, index) -> value
    generateArrayGet() {
        const vm = this.vm;

        vm.label("_array_get");
        vm.prologue(0, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0); // arr

        // 计算偏移: 24 + index * 8
        vm.shl(VReg.V0, VReg.A1, 3);
        vm.addImm(VReg.V0, VReg.V0, ARRAY_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.load(VReg.RET, VReg.V0, 0);

        vm.epilogue([VReg.S0], 0);
    }

    // 数组 set
    // _array_set(arr, index, value)
    generateArraySet() {
        const vm = this.vm;

        vm.label("_array_set");
        vm.prologue(0, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0); // arr

        // 计算偏移: 24 + index * 8
        vm.shl(VReg.V0, VReg.A1, 3);
        vm.addImm(VReg.V0, VReg.V0, ARRAY_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.store(VReg.V0, 0, VReg.A2);

        vm.epilogue([VReg.S0], 0);
    }

    // 数组长度
    // _array_length(arr) -> length
    generateArrayLength() {
        const vm = this.vm;

        vm.label("_array_length");
        vm.prologue(0, []);

        vm.load(VReg.RET, VReg.A0, 8);

        vm.epilogue([], 0);
    }

    // 数组 at (支持负索引)
    // _array_at(arr, index) -> value
    generateArrayAt() {
        const vm = this.vm;

        vm.label("_array_at");
        vm.prologue(0, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0); // arr
        vm.mov(VReg.S1, VReg.A1); // index

        // 获取长度
        vm.load(VReg.V0, VReg.S0, 8);

        // 检查索引是否为负
        vm.cmpImm(VReg.S1, 0);
        vm.jge("_array_at_positive");

        // 负索引: index = length + index
        vm.add(VReg.S1, VReg.V0, VReg.S1);

        vm.label("_array_at_positive");
        // 检查边界: index < 0 || index >= length
        vm.cmpImm(VReg.S1, 0);
        vm.jlt("_array_at_undefined");
        vm.cmp(VReg.S1, VReg.V0);
        vm.jge("_array_at_undefined");

        // 计算偏移: 24 + index * 8
        vm.shl(VReg.V1, VReg.S1, 3);
        vm.addImm(VReg.V1, VReg.V1, ARRAY_HEADER_SIZE);
        vm.add(VReg.V1, VReg.S0, VReg.V1);
        vm.load(VReg.RET, VReg.V1, 0);
        vm.epilogue([VReg.S0, VReg.S1], 0);

        vm.label("_array_at_undefined");
        vm.movImm(VReg.RET, 0); // undefined
        vm.epilogue([VReg.S0, VReg.S1], 0);
    }

    // 数组 indexOf
    // _array_indexOf(arr, value) -> index or -1
    // 支持 Number 对象的值比较
    generateArrayIndexOf() {
        const vm = this.vm;
        const TYPE_INT8 = 20;
        const TYPE_FLOAT64 = 29;

        vm.label("_array_indexOf");
        vm.prologue(0, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // arr
        vm.mov(VReg.S1, VReg.A1); // value to find
        vm.movImm(VReg.S2, 0); // i = 0

        // 获取长度
        vm.load(VReg.S3, VReg.S0, 8);

        // 预先检查 value 是否是 Number 对象
        // S4 = value 的数值（如果是 Number），否则为 0
        vm.movImm(VReg.S4, 0);
        vm.cmpImm(VReg.S1, 0);
        vm.jeq("_array_indexOf_loop"); // null，跳过
        vm.load(VReg.V0, VReg.S1, 0); // 加载 value 的类型
        vm.cmpImm(VReg.V0, TYPE_INT8);
        vm.jlt("_array_indexOf_loop"); // 不是 Number
        vm.cmpImm(VReg.V0, TYPE_FLOAT64);
        vm.jgt("_array_indexOf_loop"); // 不是 Number
        // 是 Number，加载其数值
        vm.load(VReg.S4, VReg.S1, 8);

        vm.label("_array_indexOf_loop");
        vm.cmp(VReg.S2, VReg.S3);
        vm.jge("_array_indexOf_notfound");

        // 计算偏移: 24 + i * 8
        vm.shl(VReg.V0, VReg.S2, 3);
        vm.addImm(VReg.V0, VReg.V0, ARRAY_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.load(VReg.V1, VReg.V0, 0); // V1 = arr[i]

        // 第一步：直接指针比较
        vm.cmp(VReg.V1, VReg.S1);
        vm.jeq("_array_indexOf_found");

        // 第二步：如果 value 是 Number 且 arr[i] 也是 Number，比较数值
        vm.cmpImm(VReg.S4, 0);
        vm.jeq("_array_indexOf_next"); // value 不是 Number，跳过值比较

        // 检查 arr[i] 是否是 Number
        vm.cmpImm(VReg.V1, 0);
        vm.jeq("_array_indexOf_next"); // null
        vm.load(VReg.V2, VReg.V1, 0); // V2 = arr[i] 的类型
        vm.cmpImm(VReg.V2, TYPE_INT8);
        vm.jlt("_array_indexOf_next");
        vm.cmpImm(VReg.V2, TYPE_FLOAT64);
        vm.jgt("_array_indexOf_next");
        // arr[i] 也是 Number，比较数值
        vm.load(VReg.V3, VReg.V1, 8); // V3 = arr[i] 的数值
        vm.cmp(VReg.V3, VReg.S4);
        vm.jeq("_array_indexOf_found");

        vm.label("_array_indexOf_next");
        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.jmp("_array_indexOf_loop");

        vm.label("_array_indexOf_found");
        vm.mov(VReg.RET, VReg.S2);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 0);

        vm.label("_array_indexOf_notfound");
        vm.movImm(VReg.RET, -1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 0);
    }

    // 数组 includes
    // _array_includes(arr, value) -> 0 or 1
    // 支持 Number 对象的值比较
    generateArrayIncludes() {
        const vm = this.vm;
        const TYPE_INT8 = 20;
        const TYPE_FLOAT64 = 29;

        vm.label("_array_includes");
        vm.prologue(0, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // arr
        vm.mov(VReg.S1, VReg.A1); // value to find
        vm.movImm(VReg.S2, 0); // i = 0

        // 获取长度
        vm.load(VReg.S3, VReg.S0, 8);

        // 预先检查 value 是否是 Number 对象
        vm.movImm(VReg.S4, 0);
        vm.cmpImm(VReg.S1, 0);
        vm.jeq("_array_includes_loop");
        vm.load(VReg.V0, VReg.S1, 0);
        vm.cmpImm(VReg.V0, TYPE_INT8);
        vm.jlt("_array_includes_loop");
        vm.cmpImm(VReg.V0, TYPE_FLOAT64);
        vm.jgt("_array_includes_loop");
        vm.load(VReg.S4, VReg.S1, 8);

        vm.label("_array_includes_loop");
        vm.cmp(VReg.S2, VReg.S3);
        vm.jge("_array_includes_false");

        // 计算偏移: 24 + i * 8
        vm.shl(VReg.V0, VReg.S2, 3);
        vm.addImm(VReg.V0, VReg.V0, ARRAY_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.load(VReg.V1, VReg.V0, 0);

        // 直接指针比较
        vm.cmp(VReg.V1, VReg.S1);
        vm.jeq("_array_includes_true");

        // Number 值比较
        vm.cmpImm(VReg.S4, 0);
        vm.jeq("_array_includes_next");
        vm.cmpImm(VReg.V1, 0);
        vm.jeq("_array_includes_next");
        vm.load(VReg.V2, VReg.V1, 0);
        vm.cmpImm(VReg.V2, TYPE_INT8);
        vm.jlt("_array_includes_next");
        vm.cmpImm(VReg.V2, TYPE_FLOAT64);
        vm.jgt("_array_includes_next");
        vm.load(VReg.V3, VReg.V1, 8);
        vm.cmp(VReg.V3, VReg.S4);
        vm.jeq("_array_includes_true");

        vm.label("_array_includes_next");
        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.jmp("_array_includes_loop");

        vm.label("_array_includes_true");
        vm.movImm(VReg.RET, 1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 0);

        vm.label("_array_includes_false");
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 0);
    }

    // 数组 slice (简化版，需要 _alloc)
    // _array_slice(arr, start, end) -> new array
    // end = -1 表示到末尾
    // 只用 S0-S4 五个 callee-saved 寄存器以兼容 x64
    generateArraySlice() {
        const vm = this.vm;

        vm.label("_array_slice");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // arr (原数组)
        vm.mov(VReg.S1, VReg.A1); // start
        vm.mov(VReg.S2, VReg.A2); // end

        // 获取原数组长度
        vm.load(VReg.V0, VReg.S0, 8);

        // 处理 end = -1 (到末尾)
        vm.cmpImm(VReg.S2, -1);
        vm.jne("_array_slice_calc");
        vm.mov(VReg.S2, VReg.V0);

        vm.label("_array_slice_calc");
        // 计算新数组长度: newLen = end - start
        vm.sub(VReg.S3, VReg.S2, VReg.S1); // S3 = newLen

        // 边界检查
        vm.cmpImm(VReg.S3, 0);
        vm.jle("_array_slice_empty");

        // 分配新数组: 24 + newLen * 8
        vm.shl(VReg.A0, VReg.S3, 3);
        vm.addImm(VReg.A0, VReg.A0, ARRAY_HEADER_SIZE);
        vm.call("_alloc");

        // 保存新数组指针到 S4 (S2 不再需要，但重用可能有问题)
        vm.mov(VReg.S4, VReg.RET);

        // 设置新数组头
        vm.movImm(VReg.V0, 1); // TYPE_ARRAY
        vm.store(VReg.S4, 0, VReg.V0);
        vm.store(VReg.S4, 8, VReg.S3); // length
        vm.store(VReg.S4, 16, VReg.S3); // capacity = length

        // 复制元素，用 S2 作为循环变量 (原 end 不再需要)
        vm.movImm(VReg.S2, 0); // i = 0
        vm.label("_array_slice_copy");
        vm.cmp(VReg.S2, VReg.S3);
        vm.jge("_array_slice_done");

        // src offset: 24 + (start + i) * 8
        vm.add(VReg.V0, VReg.S1, VReg.S2);
        vm.shl(VReg.V0, VReg.V0, 3);
        vm.addImm(VReg.V0, VReg.V0, ARRAY_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.load(VReg.V1, VReg.V0, 0); // V1 = src element

        // dst offset: 24 + i * 8
        vm.shl(VReg.V0, VReg.S2, 3);
        vm.addImm(VReg.V0, VReg.V0, ARRAY_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S4, VReg.V0);
        vm.store(VReg.V0, 0, VReg.V1);

        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.jmp("_array_slice_copy");

        vm.label("_array_slice_done");
        vm.mov(VReg.RET, VReg.S4);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 32);

        // 空数组
        vm.label("_array_slice_empty");
        vm.movImm(VReg.A0, ARRAY_HEADER_SIZE);
        vm.call("_alloc");
        vm.movImm(VReg.V1, 1); // TYPE_ARRAY (用 V1 避免与 RET 冲突)
        vm.store(VReg.RET, 0, VReg.V1);
        vm.movImm(VReg.V1, 0);
        vm.store(VReg.RET, 8, VReg.V1); // length = 0
        vm.store(VReg.RET, 16, VReg.V1); // capacity = 0
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 32);
    }

    // 创建指定大小的数组
    // _array_new_with_size(size) -> array
    // 数组布局: [type(8), length(8), capacity(8), elements...]
    generateArrayNewWithSize() {
        const vm = this.vm;

        vm.label("_array_new_with_size");
        vm.prologue(16, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // size (初始长度)

        // 计算实际容量: max(size, MIN_CAPACITY)
        vm.movImm(VReg.S3, ARRAY_MIN_CAPACITY);
        vm.cmp(VReg.S0, VReg.S3);
        vm.jge("_array_new_use_size");
        // capacity = MIN_CAPACITY
        vm.jmp("_array_new_alloc");

        vm.label("_array_new_use_size");
        vm.mov(VReg.S3, VReg.S0); // capacity = size

        vm.label("_array_new_alloc");
        // 计算需要分配的大小: 24 (header) + capacity * 8
        vm.shl(VReg.A0, VReg.S3, 3);
        vm.addImm(VReg.A0, VReg.A0, ARRAY_HEADER_SIZE);
        vm.call("_alloc");

        vm.mov(VReg.S1, VReg.RET); // 保存数组指针

        // 设置类型为 ARRAY (1)
        vm.movImm(VReg.V0, 1);
        vm.store(VReg.S1, 0, VReg.V0);

        // 设置长度
        vm.store(VReg.S1, 8, VReg.S0);

        // 设置容量
        vm.store(VReg.S1, 16, VReg.S3);

        // 初始化所有元素为 0 (undefined)，遍历到 capacity
        vm.movImm(VReg.S2, 0); // counter

        vm.label("_array_new_init_loop");
        vm.cmp(VReg.S2, VReg.S3);
        vm.jge("_array_new_init_done");

        // 计算元素偏移: 24 + counter * 8
        vm.shl(VReg.V0, VReg.S2, 3);
        vm.addImm(VReg.V0, VReg.V0, ARRAY_HEADER_SIZE);
        vm.add(VReg.V1, VReg.S1, VReg.V0);
        vm.movImm(VReg.V0, 0);
        vm.store(VReg.V1, 0, VReg.V0);

        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.jmp("_array_new_init_loop");

        vm.label("_array_new_init_done");
        vm.mov(VReg.RET, VReg.S1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 16);
    }

    generate() {
        this.generateArrayPush();
        this.generateArrayPop();
        this.generateArrayGet();
        this.generateArraySet();
        this.generateArrayLength();
        this.generateArrayAt();
        this.generateArrayIndexOf();
        this.generateArrayIncludes();
        this.generateArraySlice();
        this.generateArrayNewWithSize();
    }
}
