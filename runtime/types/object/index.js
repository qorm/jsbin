// JSBin 对象运行时
// 提供对象操作函数

import { VReg } from "../../../vm/registers.js";

// 对象内存布局:
// +0:  type (8 bytes) = TYPE_OBJECT (2)
// +8:  属性数量 count (8 bytes)
// +16: __proto__ 指针 (8 bytes)
// +24: 属性区开始
//      每个属性: key指针(8) + value(8) = 16 bytes

const TYPE_OBJECT = 2;
const OBJECT_HEADER_SIZE = 24; // type + count + __proto__
const PROP_SIZE = 16; // key + value

export class ObjectGenerator {
    constructor(vm) {
        this.vm = vm;
    }

    generate() {
        this.generateObjectNew();
        this.generateObjectGet();
        this.generateObjectSet();
        this.generateObjectHas();
        this.generatePropIn();
        this.generateObjectKeys();
        this.generateObjectValues();
        this.generateObjectEntries();
        this.generateObjectAssign();
        this.generateObjectCreate();
        this.generateHasOwnProperty();
        this.generateObjectToString();
        this.generateObjectValueOf();
        this.generateGetPrototypeOf();
        this.generateSetPrototypeOf();
    }

    // 创建新对象
    // _object_new() -> obj
    generateObjectNew() {
        const vm = this.vm;

        vm.label("_object_new");
        vm.prologue(0, [VReg.S0]);

        // 分配 256 字节空间（足够存储多个属性）
        vm.movImm(VReg.A0, 256);
        vm.call("_alloc");
        vm.mov(VReg.S0, VReg.RET);

        // 设置类型
        vm.movImm(VReg.V0, TYPE_OBJECT);
        vm.store(VReg.S0, 0, VReg.V0);

        // 初始化属性数量为 0
        vm.movImm(VReg.V0, 0);
        vm.store(VReg.S0, 8, VReg.V0);

        // 初始化 __proto__ 为 0 (null)
        vm.store(VReg.S0, 16, VReg.V0);

        vm.mov(VReg.RET, VReg.S0);
        vm.epilogue([VReg.S0], 0);
    }

    // 对象获取属性
    // _object_get(obj, key) -> value
    generateObjectGet() {
        const vm = this.vm;

        vm.label("_object_get");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // obj
        vm.mov(VReg.S1, VReg.A1); // key

        // 检查 obj 是否为 null
        vm.cmpImm(VReg.S0, 0);
        vm.jeq("_object_get_notfound");

        // 加载属性数量
        vm.load(VReg.S2, VReg.S0, 8); // prop count
        vm.movImm(VReg.S3, 0); // index

        const loopLabel = "_object_get_loop";
        const foundLabel = "_object_get_found";
        const notFoundLabel = "_object_get_notfound";
        const checkProtoLabel = "_object_get_check_proto";

        vm.label(loopLabel);
        vm.cmp(VReg.S3, VReg.S2);
        vm.jge(checkProtoLabel);

        // 计算属性偏移: OBJECT_HEADER_SIZE + index * PROP_SIZE
        vm.shl(VReg.V0, VReg.S3, 4); // index * 16
        vm.addImm(VReg.V0, VReg.V0, OBJECT_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);

        // 加载 key
        vm.load(VReg.A0, VReg.V0, 0);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_strcmp");

        vm.cmpImm(VReg.RET, 0);
        vm.jeq(foundLabel);

        vm.addImm(VReg.S3, VReg.S3, 1);
        vm.jmp(loopLabel);

        vm.label(foundLabel);
        // 加载 value: offset + 8
        vm.shl(VReg.V0, VReg.S3, 4);
        vm.addImm(VReg.V0, VReg.V0, OBJECT_HEADER_SIZE + 8);
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.load(VReg.RET, VReg.V0, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);

        // 在原型链上查找
        vm.label(checkProtoLabel);
        vm.load(VReg.V0, VReg.S0, 16); // __proto__
        vm.cmpImm(VReg.V0, 0);
        vm.jeq(notFoundLabel);
        // 递归查找原型
        vm.mov(VReg.A0, VReg.V0);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_object_get");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);

        vm.label(notFoundLabel);
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
    }

    // 对象设置属性
    // _object_set(obj, key, value)
    generateObjectSet() {
        const vm = this.vm;

        vm.label("_object_set");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        vm.mov(VReg.S0, VReg.A0); // obj
        vm.mov(VReg.S1, VReg.A1); // key
        vm.mov(VReg.S2, VReg.A2); // value

        // 先查找已有属性
        vm.load(VReg.S3, VReg.S0, 8); // prop count
        vm.movImm(VReg.S4, 0); // index

        const loopLabel = "_object_set_loop";
        const foundLabel = "_object_set_found";
        const notFoundLabel = "_object_set_notfound";
        const doneLabel = "_object_set_done";

        vm.label(loopLabel);
        vm.cmp(VReg.S4, VReg.S3);
        vm.jge(notFoundLabel);

        // 计算属性偏移
        vm.shl(VReg.V0, VReg.S4, 4);
        vm.addImm(VReg.V0, VReg.V0, OBJECT_HEADER_SIZE);
        vm.add(VReg.S5, VReg.S0, VReg.V0); // S5 = 属性地址

        // 加载现有 key 并比较
        vm.load(VReg.A0, VReg.S5, 0);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_strcmp");

        vm.cmpImm(VReg.RET, 0);
        vm.jeq(foundLabel);

        vm.addImm(VReg.S4, VReg.S4, 1);
        vm.jmp(loopLabel);

        // 找到已有属性，更新 value
        vm.label(foundLabel);
        vm.store(VReg.S5, 8, VReg.S2);
        vm.jmp(doneLabel);

        // 未找到，添加新属性
        vm.label(notFoundLabel);
        // 新属性偏移
        vm.shl(VReg.V0, VReg.S3, 4);
        vm.addImm(VReg.V0, VReg.V0, OBJECT_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);

        // 存储 key
        vm.store(VReg.V0, 0, VReg.S1);
        // 存储 value
        vm.store(VReg.V0, 8, VReg.S2);

        // 更新 count
        vm.addImm(VReg.S3, VReg.S3, 1);
        vm.store(VReg.S0, 8, VReg.S3);

        vm.label(doneLabel);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 32);
    }

    // 检查对象是否有指定属性（不检查原型链）
    // _object_has(obj, key) -> 0/1
    generateObjectHas() {
        const vm = this.vm;

        vm.label("_object_has");
        vm.prologue(16, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // obj
        vm.mov(VReg.S1, VReg.A1); // key

        vm.cmpImm(VReg.S0, 0);
        vm.jeq("_object_has_false");

        vm.load(VReg.S2, VReg.S0, 8); // count
        vm.movImm(VReg.S3, 0);

        vm.label("_object_has_loop");
        vm.cmp(VReg.S3, VReg.S2);
        vm.jge("_object_has_false");

        vm.shl(VReg.V0, VReg.S3, 4);
        vm.addImm(VReg.V0, VReg.V0, OBJECT_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);

        vm.load(VReg.A0, VReg.V0, 0);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_strcmp");

        vm.cmpImm(VReg.RET, 0);
        vm.jeq("_object_has_true");

        vm.addImm(VReg.S3, VReg.S3, 1);
        vm.jmp("_object_has_loop");

        vm.label("_object_has_true");
        vm.movImm(VReg.RET, 1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 16);

        vm.label("_object_has_false");
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 16);
    }

    // 检查属性是否在对象中（包含原型链检查）
    // _prop_in(obj, key) -> 0/1
    // 用于实现 JavaScript 的 "in" 运算符
    generatePropIn() {
        const vm = this.vm;

        vm.label("_prop_in");
        vm.prologue(16, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // obj
        vm.mov(VReg.S1, VReg.A1); // key

        // 检查 obj 是否为 null
        vm.cmpImm(VReg.S0, 0);
        vm.jeq("_prop_in_false");

        vm.load(VReg.S2, VReg.S0, 8); // count
        vm.movImm(VReg.S3, 0);

        vm.label("_prop_in_loop");
        vm.cmp(VReg.S3, VReg.S2);
        vm.jge("_prop_in_check_proto");

        vm.shl(VReg.V0, VReg.S3, 4);
        vm.addImm(VReg.V0, VReg.V0, OBJECT_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);

        vm.load(VReg.A0, VReg.V0, 0);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_strcmp");

        vm.cmpImm(VReg.RET, 0);
        vm.jeq("_prop_in_true");

        vm.addImm(VReg.S3, VReg.S3, 1);
        vm.jmp("_prop_in_loop");

        // 在原型链上查找
        vm.label("_prop_in_check_proto");
        vm.load(VReg.V0, VReg.S0, 16); // __proto__
        vm.cmpImm(VReg.V0, 0);
        vm.jeq("_prop_in_false");
        // 递归查找原型
        vm.mov(VReg.A0, VReg.V0);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_prop_in");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 16);

        vm.label("_prop_in_true");
        vm.movImm(VReg.RET, 1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 16);

        vm.label("_prop_in_false");
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 16);
    }

    // Object.keys(obj) -> 返回包含所有键的数组
    // _object_keys(obj) -> array
    generateObjectKeys() {
        const vm = this.vm;

        vm.label("_object_keys");
        vm.prologue(0, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // obj

        // 获取属性数量
        vm.load(VReg.S1, VReg.S0, 8); // count

        // 创建结果数组
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_array_new_with_size");
        vm.mov(VReg.S2, VReg.RET); // result array

        // 遍历属性
        vm.movImm(VReg.S3, 0); // index

        vm.label("_object_keys_loop");
        vm.cmp(VReg.S3, VReg.S1);
        vm.jge("_object_keys_done");

        // 获取 key
        vm.shl(VReg.V0, VReg.S3, 4);
        vm.addImm(VReg.V0, VReg.V0, OBJECT_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.load(VReg.S4, VReg.V0, 0); // key -> S4 保存

        // 设置到数组
        vm.mov(VReg.A0, VReg.S2);
        vm.mov(VReg.A1, VReg.S3);
        vm.mov(VReg.A2, VReg.S4);
        vm.call("_array_set");

        vm.addImm(VReg.S3, VReg.S3, 1);
        vm.jmp("_object_keys_loop");

        vm.label("_object_keys_done");
        vm.mov(VReg.RET, VReg.S2);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 0);
    }

    // Object.values(obj) -> 返回包含所有值的数组
    // _object_values(obj) -> array
    generateObjectValues() {
        const vm = this.vm;

        vm.label("_object_values");
        vm.prologue(0, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // obj
        vm.load(VReg.S1, VReg.S0, 8); // count

        vm.mov(VReg.A0, VReg.S1);
        vm.call("_array_new_with_size");
        vm.mov(VReg.S2, VReg.RET);

        vm.movImm(VReg.S3, 0);

        vm.label("_object_values_loop");
        vm.cmp(VReg.S3, VReg.S1);
        vm.jge("_object_values_done");

        vm.shl(VReg.V0, VReg.S3, 4);
        vm.addImm(VReg.V0, VReg.V0, OBJECT_HEADER_SIZE + 8); // value offset
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.load(VReg.S4, VReg.V0, 0); // value -> S4

        vm.mov(VReg.A0, VReg.S2);
        vm.mov(VReg.A1, VReg.S3);
        vm.mov(VReg.A2, VReg.S4);
        vm.call("_array_set");

        vm.addImm(VReg.S3, VReg.S3, 1);
        vm.jmp("_object_values_loop");

        vm.label("_object_values_done");
        vm.mov(VReg.RET, VReg.S2);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 0);
    }

    // Object.entries(obj) -> 返回 [[key, value], ...] 数组
    // _object_entries(obj) -> array
    generateObjectEntries() {
        const vm = this.vm;

        vm.label("_object_entries");
        vm.prologue(16, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        vm.mov(VReg.S0, VReg.A0); // obj
        vm.load(VReg.S1, VReg.S0, 8); // count

        // result = new Array(count)
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_array_new_with_size");
        vm.mov(VReg.S2, VReg.RET);

        vm.movImm(VReg.S3, 0); // index

        vm.label("_object_entries_loop");
        vm.cmp(VReg.S3, VReg.S1);
        vm.jge("_object_entries_done");

        // propAddr = obj + OBJECT_HEADER_SIZE + index*16
        vm.shl(VReg.V0, VReg.S3, 4);
        vm.addImm(VReg.V0, VReg.V0, OBJECT_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);

        // key/value
        vm.load(VReg.S4, VReg.V0, 0);
        vm.load(VReg.S5, VReg.V0, 8);

        // pair = new Array(2)
        vm.movImm(VReg.A0, 2);
        vm.call("_array_new_with_size");
        vm.store(VReg.SP, 0, VReg.RET);

        // pair[0] = key
        vm.load(VReg.A0, VReg.SP, 0);
        vm.movImm(VReg.A1, 0);
        vm.mov(VReg.A2, VReg.S4);
        vm.call("_array_set");

        // pair[1] = value
        vm.load(VReg.A0, VReg.SP, 0);
        vm.movImm(VReg.A1, 1);
        vm.mov(VReg.A2, VReg.S5);
        vm.call("_array_set");

        // result[index] = pair
        vm.mov(VReg.A0, VReg.S2);
        vm.mov(VReg.A1, VReg.S3);
        vm.load(VReg.A2, VReg.SP, 0);
        vm.call("_array_set");

        vm.addImm(VReg.S3, VReg.S3, 1);
        vm.jmp("_object_entries_loop");

        vm.label("_object_entries_done");
        vm.mov(VReg.RET, VReg.S2);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 16);
    }

    // Object.assign(target, ...sources) -> target
    // 简化版：_object_assign(target, source) -> target
    generateObjectAssign() {
        const vm = this.vm;

        vm.label("_object_assign");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // target
        vm.mov(VReg.S1, VReg.A1); // source

        vm.cmpImm(VReg.S1, 0);
        vm.jeq("_object_assign_done");

        vm.load(VReg.S2, VReg.S1, 8); // source count
        vm.movImm(VReg.S3, 0);

        vm.label("_object_assign_loop");
        vm.cmp(VReg.S3, VReg.S2);
        vm.jge("_object_assign_done");

        // 获取 source 的 key 和 value
        vm.shl(VReg.V0, VReg.S3, 4);
        vm.addImm(VReg.V0, VReg.V0, OBJECT_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S1, VReg.V0);

        vm.load(VReg.V1, VReg.V0, 0); // key
        vm.load(VReg.V2, VReg.V0, 8); // value

        // 设置到 target
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A1, VReg.V1);
        vm.mov(VReg.A2, VReg.V2);
        vm.call("_object_set");

        vm.addImm(VReg.S3, VReg.S3, 1);
        vm.jmp("_object_assign_loop");

        vm.label("_object_assign_done");
        vm.mov(VReg.RET, VReg.S0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
    }

    // Object.create(proto) -> obj
    generateObjectCreate() {
        const vm = this.vm;

        vm.label("_object_create");
        vm.prologue(16, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0); // proto

        // 创建新对象
        vm.call("_object_new");
        vm.mov(VReg.S1, VReg.RET);

        // 设置 __proto__
        vm.store(VReg.S1, 16, VReg.S0);

        vm.mov(VReg.RET, VReg.S1);
        vm.epilogue([VReg.S0, VReg.S1], 16);
    }

    // obj.hasOwnProperty(key) -> boolean
    generateHasOwnProperty() {
        const vm = this.vm;

        vm.label("_hasOwnProperty");
        // 直接调用 _object_has
        vm.jmp("_object_has");
    }

    // Object.getPrototypeOf(obj) -> proto
    generateGetPrototypeOf() {
        const vm = this.vm;

        vm.label("_object_getPrototypeOf");
        vm.prologue(0, []);

        vm.cmpImm(VReg.A0, 0);
        vm.jeq("_object_getPrototypeOf_null");

        vm.load(VReg.RET, VReg.A0, 16);
        vm.epilogue([], 0);

        vm.label("_object_getPrototypeOf_null");
        vm.movImm(VReg.RET, 0);
        vm.epilogue([], 0);
    }

    // Object.setPrototypeOf(obj, proto) -> obj
    generateSetPrototypeOf() {
        const vm = this.vm;

        vm.label("_object_setPrototypeOf");
        vm.prologue(0, []);

        vm.cmpImm(VReg.A0, 0);
        vm.jeq("_object_setPrototypeOf_done");

        vm.store(VReg.A0, 16, VReg.A1);

        vm.label("_object_setPrototypeOf_done");
        vm.mov(VReg.RET, VReg.A0);
        vm.epilogue([], 0);
    }

    // obj.toString() -> "[object Object]"
    generateObjectToString() {
        const vm = this.vm;

        vm.label("_object_toString");
        vm.prologue(0, []);
        vm.lea(VReg.RET, "_str_object");
        vm.epilogue([], 0);
    }

    // obj.valueOf() -> obj
    generateObjectValueOf() {
        const vm = this.vm;

        vm.label("_object_valueOf");
        vm.prologue(0, []);
        vm.mov(VReg.RET, VReg.A0);
        vm.epilogue([], 0);
    }
}
