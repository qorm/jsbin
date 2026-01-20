// JSBin 打印运行时
// 提供输出函数

import { VReg } from "../../vm/registers.js";
import { TYPE_STRING, TYPE_ARRAY, TYPE_OBJECT, TYPE_CLOSURE, TYPE_DATE, TYPE_PROMISE, TYPE_INT8, TYPE_FLOAT64, HEADER_SIZE } from "./allocator.js";
import { TYPE_INT8_ARRAY, TYPE_FLOAT64_ARRAY, TYPE_ARRAY_BUFFER } from "./types.js";

export class PrintGenerator {
    constructor(vm) {
        this.vm = vm;
    }

    // 辅助：调用 write 系统调用或 Windows API
    // A0=fd/unused, A1=buf, A2=len
    emitWriteCall() {
        const vm = this.vm;
        const platform = vm.platform;
        const arch = vm.arch;

        if (platform === "windows") {
            // Windows: 使用 WriteConsoleA
            // 需要先 GetStdHandle(-11) 获取 stdout
            // 参数已在 A1=buf, A2=len
            vm.callWindowsWriteConsole();
        } else if (arch === "arm64") {
            vm.syscall(platform === "linux" ? 64 : 4);
        } else {
            vm.syscall(platform === "linux" ? 1 : 0x2000004);
        }
    }

    // 打印字符串（无换行版本，供内部使用）
    generatePrintStringNoNL() {
        const vm = this.vm;

        vm.label("_print_str_no_nl");
        vm.prologue(16, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0); // str pointer

        // 先计算长度
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_strlen");
        vm.mov(VReg.S1, VReg.RET); // length

        // write(1, str, len)
        vm.movImm(VReg.A0, 1); // stdout
        vm.mov(VReg.A1, VReg.S0); // str
        vm.mov(VReg.A2, VReg.S1); // len

        this.emitWriteCall();

        vm.epilogue([VReg.S0, VReg.S1], 16);
    }

    // 打印字符串（带换行）
    generatePrintString() {
        const vm = this.vm;

        vm.label("_print_str");
        vm.prologue(16, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0); // str pointer

        // 先计算长度
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_strlen");
        vm.mov(VReg.S1, VReg.RET); // length

        // write(1, str, len)
        vm.movImm(VReg.A0, 1); // stdout
        vm.mov(VReg.A1, VReg.S0); // str
        vm.mov(VReg.A2, VReg.S1); // len

        this.emitWriteCall();

        // 打印换行
        vm.movImm(VReg.V0, 10); // '\n'
        vm.push(VReg.V0);
        vm.movImm(VReg.A0, 1);
        vm.mov(VReg.A1, VReg.SP);
        vm.movImm(VReg.A2, 1);

        this.emitWriteCall();

        vm.pop(VReg.V0);
        vm.epilogue([VReg.S0, VReg.S1], 16);
    }

    // 打印换行
    generatePrintNewline() {
        const vm = this.vm;

        vm.label("_print_nl");
        vm.prologue(16, []);

        vm.movImm(VReg.V0, 10); // '\n'
        vm.push(VReg.V0);
        vm.movImm(VReg.A0, 1);
        vm.mov(VReg.A1, VReg.SP);
        vm.movImm(VReg.A2, 1);

        this.emitWriteCall();

        vm.pop(VReg.V0);
        vm.epilogue([], 16);
    }

    // 打印布尔值 (true/false)
    generatePrintBool() {
        const vm = this.vm;

        vm.label("_print_bool");
        vm.prologue(16, [VReg.S0]);
        vm.mov(VReg.S0, VReg.A0);

        // 如果值为 0，打印 "false"，否则打印 "true"
        vm.cmpImm(VReg.S0, 0);
        const falseLabel = "_print_bool_false";
        vm.jeq(falseLabel);

        // 打印 "true"
        vm.lea(VReg.A0, "_str_true");
        vm.call("_print_str");
        vm.epilogue([VReg.S0], 16);

        vm.label(falseLabel);
        // 打印 "false"
        vm.lea(VReg.A0, "_str_false");
        vm.call("_print_str");
        vm.epilogue([VReg.S0], 16);
    }

    // 打印布尔值（无换行版本）
    generatePrintBoolNoNL() {
        const vm = this.vm;

        vm.label("_print_bool_no_nl");
        vm.prologue(16, [VReg.S0]);
        vm.mov(VReg.S0, VReg.A0);

        // 如果值为 0，打印 "false"，否则打印 "true"
        vm.cmpImm(VReg.S0, 0);
        const falseLabel = "_print_bool_no_nl_false";
        vm.jeq(falseLabel);

        // 打印 "true"
        vm.lea(VReg.A0, "_str_true");
        vm.call("_print_str_no_nl");
        vm.epilogue([VReg.S0], 16);

        vm.label(falseLabel);
        // 打印 "false"
        vm.lea(VReg.A0, "_str_false");
        vm.call("_print_str_no_nl");
        vm.epilogue([VReg.S0], 16);
    }

    // 打印空格
    generatePrintSpace() {
        const vm = this.vm;

        vm.label("_print_space");
        vm.prologue(16, []);

        // 打印空格字符
        vm.movImm(VReg.V0, 32); // ' '
        vm.push(VReg.V0);
        vm.movImm(VReg.A0, 1);
        vm.mov(VReg.A1, VReg.SP);
        vm.movImm(VReg.A2, 1);
        this.emitWriteCall();
        vm.pop(VReg.V0);

        vm.epilogue([], 16);
    }

    // print 函数的包装器（可作为一等公民传递）
    generatePrintWrapper() {
        const vm = this.vm;

        vm.label("_print_wrapper");
        vm.prologue(16, [VReg.S0]);
        // A0 已经是要打印的值
        vm.call("_print_value");
        vm.movImm(VReg.RET, 0); // 返回 undefined
        vm.epilogue([VReg.S0], 16);
    }

    // 统一的值打印函数
    // 支持 NaN-boxing 格式的值打印
    //
    // NaN-boxing 编码:
    //   - 纯 double: 直接是 IEEE 754 浮点数（不是特殊 NaN 模式）
    //   - Tagged value: 高 16 位是 0x7FF8-0x7FFF (tag 0-7)
    //   - Tag 0: int32, Tag 1: bool, Tag 2: null, Tag 3: undefined
    //   - Tag 4: string, Tag 5: object, Tag 6: array, Tag 7: function
    generatePrintValue() {
        const vm = this.vm;

        vm.label("_print_value");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);
        vm.mov(VReg.S0, VReg.A0); // 保存值

        const doneLabel = "_print_value_done";
        const notNanBoxedLabel = "_print_value_not_nanboxed";

        // ============ 检查是否是 NaN-boxed 值 ============
        // NaN-boxed 值的高 13 位是 0x1FFF（检查 (value >> 51) == 0x1FFF）
        // 即高 12 位是 0x7FF（指数全1）且第 51 位（quiet bit）为 1
        vm.mov(VReg.V0, VReg.S0);
        vm.shrImm(VReg.V0, VReg.V0, 51); // 右移 51 位得到高 13 位
        vm.movImm(VReg.V1, 0x1fff); // 0x1FFF = 8191
        vm.cmp(VReg.V0, VReg.V1);
        vm.jne(notNanBoxedLabel); // 不是 NaN-boxed，可能是纯浮点数或其他

        // ============ 是 NaN-boxed 值，提取 tag ============
        // tag 在 bits 48-50 (3 bits)
        vm.mov(VReg.V0, VReg.S0);
        vm.shrImm(VReg.V0, VReg.V0, 48); // 右移 48 位
        vm.andImm(VReg.V0, VReg.V0, 0x7); // 取低 3 位 = tag
        vm.mov(VReg.S1, VReg.V0); // S1 = tag

        // 根据 tag 分发
        // tag 0: int32
        vm.cmpImm(VReg.S1, 0);
        vm.jeq("_print_value_int32");

        // tag 1: boolean
        vm.cmpImm(VReg.S1, 1);
        vm.jeq("_print_value_bool");

        // tag 2: null
        vm.cmpImm(VReg.S1, 2);
        vm.jeq("_print_value_null");

        // tag 3: undefined
        vm.cmpImm(VReg.S1, 3);
        vm.jeq("_print_value_undefined");

        // tag 4: string (pointer)
        vm.cmpImm(VReg.S1, 4);
        vm.jeq("_print_value_string_ptr");

        // tag 5: object (pointer)
        vm.cmpImm(VReg.S1, 5);
        vm.jeq("_print_value_object_ptr");

        // tag 6: array (pointer)
        vm.cmpImm(VReg.S1, 6);
        vm.jeq("_print_value_array_ptr");

        // tag 7: function (pointer)
        vm.cmpImm(VReg.S1, 7);
        vm.jeq("_print_value_function_ptr");

        // 未知 tag，打印 [unknown]
        vm.lea(VReg.A0, "_str_unknown");
        vm.call("_print_str");
        vm.jmp(doneLabel);

        // ============ Tag 处理分支 ============

        // int32: payload 是 32 位整数
        vm.label("_print_value_int32");
        // 提取低 32 位作为有符号整数
        vm.mov(VReg.A0, VReg.S0);
        // 对于 32 位整数，符号扩展低 32 位
        vm.shl(VReg.A0, VReg.A0, 32);
        vm.sarImm(VReg.A0, VReg.A0, 32); // 算术右移恢复符号
        vm.call("_print_int");
        vm.jmp(doneLabel);

        // boolean: payload 0=false, 1=true
        vm.label("_print_value_bool");
        vm.andImm(VReg.V0, VReg.S0, 1); // 取最低位
        vm.cmpImm(VReg.V0, 0);
        vm.jeq("_print_value_false");
        vm.lea(VReg.A0, "_str_true");
        vm.call("_print_str");
        vm.jmp(doneLabel);
        vm.label("_print_value_false");
        vm.lea(VReg.A0, "_str_false");
        vm.call("_print_str");
        vm.jmp(doneLabel);

        // null
        vm.label("_print_value_null");
        vm.lea(VReg.A0, "_str_null");
        vm.call("_print_str");
        vm.jmp(doneLabel);

        // undefined
        vm.label("_print_value_undefined");
        vm.lea(VReg.A0, "_str_undefined");
        vm.call("_print_str");
        vm.jmp(doneLabel);

        // string pointer: 提取 48 位指针
        vm.label("_print_value_string_ptr");
        // payload 是 48 位指针
        vm.mov(VReg.A0, VReg.S0);
        vm.movImm64(VReg.V1, 0x0000ffffffffffffn);
        vm.and(VReg.A0, VReg.A0, VReg.V1); // 提取低 48 位
        // 检查是否是堆字符串（有 16 字节头部）还是数据段字符串
        vm.lea(VReg.V1, "_heap_base");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.A0, VReg.V1);
        vm.jlt("_print_value_str_data"); // < heap_base，是数据段字符串
        // 是堆字符串，跳过 16 字节头部
        vm.addImm(VReg.A0, VReg.A0, 16);
        vm.call("_print_str");
        vm.jmp(doneLabel);
        vm.label("_print_value_str_data");
        vm.call("_print_str");
        vm.jmp(doneLabel);

        // object pointer
        vm.label("_print_value_object_ptr");
        // 打印 "[object Object]" 或调用 toString
        vm.lea(VReg.A0, "_str_object");
        vm.call("_print_str");
        vm.jmp(doneLabel);

        // array pointer
        vm.label("_print_value_array_ptr");
        vm.mov(VReg.A0, VReg.S0);
        vm.movImm64(VReg.V1, 0x0000ffffffffffffn);
        vm.and(VReg.A0, VReg.A0, VReg.V1); // 提取低 48 位
        vm.call("_print_array");
        vm.jmp(doneLabel);

        // function pointer
        vm.label("_print_value_function_ptr");
        vm.lea(VReg.A0, "_str_function");
        vm.call("_print_str");
        vm.jmp(doneLabel);

        // ============ 非 NaN-boxed 值 ============
        vm.label(notNanBoxedLabel);
        // 可能是:
        // 1. 纯浮点数 (IEEE 754 double)
        // 2. 原始指针（向后兼容旧代码）
        // 3. 小整数

        // 检查是否为 0
        vm.cmpImm(VReg.S0, 0);
        vm.jne("_print_value_not_zero");
        vm.movImm(VReg.A0, 0);
        vm.call("_print_int");
        vm.jmp(doneLabel);

        vm.label("_print_value_not_zero");

        // 首先检查是否在数据段范围内（静态字符串向后兼容）
        vm.lea(VReg.V1, "_data_start");
        vm.cmp(VReg.S0, VReg.V1);
        vm.jlt("_print_value_check_heap");
        vm.lea(VReg.V1, "_data_start");
        vm.addImm(VReg.V1, VReg.V1, 0x100000);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jge("_print_value_check_heap");
        // 是数据段字符串
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_print_str");
        vm.jmp(doneLabel);

        vm.label("_print_value_check_heap");
        // 检查是否在堆范围内（向后兼容原始指针）
        vm.lea(VReg.V1, "_heap_base");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jlt("_print_value_not_heap");
        vm.lea(VReg.V1, "_heap_ptr");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jge("_print_value_as_float");

        // 是堆对象，检查类型
        vm.load(VReg.V2, VReg.S0, 0);
        vm.andImm(VReg.V2, VReg.V2, 0xff);

        vm.cmpImm(VReg.V2, TYPE_ARRAY);
        vm.jeq("_print_value_heap_array");
        vm.cmpImm(VReg.V2, TYPE_OBJECT);
        vm.jeq("_print_value_heap_object");
        vm.cmpImm(VReg.V2, TYPE_CLOSURE);
        vm.jeq("_print_value_heap_function");
        vm.cmpImm(VReg.V2, TYPE_STRING);
        vm.jeq("_print_value_heap_string");
        vm.cmpImm(VReg.V2, TYPE_DATE);
        vm.jeq("_print_value_heap_date");
        // 检查 Number 对象 (TYPE_FLOAT64 = 29)
        vm.cmpImm(VReg.V2, TYPE_FLOAT64);
        vm.jeq("_print_value_heap_number");
        // 默认当作对象
        vm.jmp("_print_value_heap_object");

        // Number 对象: 类型在 +0, 值在 +8
        vm.label("_print_value_heap_number");
        vm.load(VReg.A0, VReg.S0, 8); // 加载 IEEE 754 值
        vm.call("_print_float");
        vm.jmp(doneLabel);

        vm.label("_print_value_heap_array");
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_print_array");
        vm.jmp(doneLabel);

        vm.label("_print_value_heap_object");
        vm.lea(VReg.A0, "_str_object");
        vm.call("_print_str");
        vm.jmp(doneLabel);

        vm.label("_print_value_heap_function");
        vm.lea(VReg.A0, "_str_function");
        vm.call("_print_str");
        vm.jmp(doneLabel);

        vm.label("_print_value_heap_string");
        vm.addImm(VReg.A0, VReg.S0, 16);
        vm.call("_print_str");
        vm.jmp(doneLabel);

        vm.label("_print_value_heap_date");
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_date_toISOString");
        vm.addImm(VReg.A0, VReg.RET, 16);
        vm.call("_print_str");
        vm.jmp(doneLabel);

        vm.label("_print_value_not_heap");
        // 不在堆范围内，可能是整数或浮点数
        // 检查是否是小整数（-1MB 到 1MB）
        vm.cmpImm(VReg.S0, 0);
        vm.jlt("_print_value_check_neg");
        vm.movImm(VReg.V1, 0x100000);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jlt("_print_value_as_int");
        vm.jmp("_print_value_as_float");

        vm.label("_print_value_check_neg");
        vm.movImm(VReg.V1, -0x100000);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jge("_print_value_as_int");
        // 大负数，当作浮点数
        vm.jmp("_print_value_as_float");

        vm.label("_print_value_as_int");
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_print_int");
        vm.jmp(doneLabel);

        vm.label("_print_value_as_float");
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_print_float");
        vm.jmp(doneLabel);

        vm.label(doneLabel);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    }

    // 打印数组 [1, 2, 3]
    generatePrintArray() {
        const vm = this.vm;

        vm.label("_print_array");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);
        vm.mov(VReg.S0, VReg.A0); // 数组指针

        // 打印 "["
        vm.lea(VReg.A0, "_str_lbracket");
        vm.call("_print_str_no_nl");

        // 获取数组长度 (在偏移 8 处)
        vm.load(VReg.S1, VReg.S0, 8); // length

        // 索引从 0 开始
        vm.movImm(VReg.S2, 0); // index

        const loopLabel = "_print_array_loop";
        const endLabel = "_print_array_end";
        const notFirstLabel = "_print_array_not_first";

        vm.label(loopLabel);
        vm.cmp(VReg.S2, VReg.S1);
        vm.jge(endLabel);

        // 如果不是第一个元素，先打印 ", "
        vm.cmpImm(VReg.S2, 0);
        vm.jeq(notFirstLabel);
        vm.lea(VReg.A0, "_str_comma");
        vm.call("_print_str_no_nl");

        vm.label(notFirstLabel);
        // 获取元素值: array[index] = *(array + 16 + index * 8)
        vm.mov(VReg.V0, VReg.S2);
        vm.shl(VReg.V0, VReg.V0, 3); // index * 8
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.load(VReg.A0, VReg.V0, 16); // 跳过 header (16 bytes)
        vm.call("_print_array_elem_no_nl");

        // 索引加 1
        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.jmp(loopLabel);

        vm.label(endLabel);
        // 打印 "]" 和换行
        vm.lea(VReg.A0, "_str_rbracket");
        vm.call("_print_str");

        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    }

    // 数组元素打印（无换行）
    // - 字符串元素：打印带双引号的内容
    // - 其他：复用 _print_value_no_nl
    generatePrintArrayElemNoNL() {
        const vm = this.vm;

        vm.label("_print_array_elem_no_nl");
        vm.prologue(32, [VReg.S0, VReg.S1]);
        vm.mov(VReg.S0, VReg.A0);

        const doneLabel = "_print_array_elem_done";
        const checkDataLabel = "_print_array_elem_check_data";
        const isHeapObjLabel = "_print_array_elem_is_heap";
        const isStringLabel = "_print_array_elem_is_string";
        const isDataStringLabel = "_print_array_elem_is_data_string";

        // 0 直接走通用逻辑
        vm.cmpImm(VReg.S0, 0);
        vm.jeq(checkDataLabel);

        // heap_base <= ptr < heap_ptr 才认为是堆对象
        vm.lea(VReg.V1, "_heap_base");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jlt(checkDataLabel);

        vm.lea(VReg.V2, "_heap_ptr");
        vm.load(VReg.V2, VReg.V2, 0);
        vm.cmp(VReg.S0, VReg.V2);
        vm.jge(checkDataLabel);

        vm.jmp(isHeapObjLabel);

        vm.label(isHeapObjLabel);
        vm.load(VReg.V2, VReg.S0, 0);
        vm.andImm(VReg.V2, VReg.V2, 0xff);
        vm.movImm(VReg.V3, TYPE_STRING);
        vm.cmp(VReg.V2, VReg.V3);
        vm.jeq(isStringLabel);

        // 非字符串，走通用打印
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_print_value_no_nl");
        vm.jmp(doneLabel);

        vm.label(isStringLabel);
        // 打印 " + content + " (堆字符串内容在 +16)
        vm.lea(VReg.A0, "_str_quote");
        vm.call("_print_str_no_nl");
        vm.addImm(VReg.A0, VReg.S0, 16);
        vm.call("_print_str_no_nl");
        vm.lea(VReg.A0, "_str_quote");
        vm.call("_print_str_no_nl");
        vm.jmp(doneLabel);

        vm.label(checkDataLabel);
        // 数据段字符串：如果首字节在可打印 ASCII 范围内，则按字符串加引号输出
        // 否则退回通用打印
        vm.movImm(VReg.V1, 0x100000);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jlt(isDataStringLabel); // < 1MB 肯定不是数据段字符串，走通用打印

        vm.loadByte(VReg.V1, VReg.S0, 0);
        vm.cmpImm(VReg.V1, 32);
        vm.jlt(isDataStringLabel);
        vm.cmpImm(VReg.V1, 127);
        vm.jge(isDataStringLabel);

        // 看起来像 C 字符串
        vm.lea(VReg.A0, "_str_quote");
        vm.call("_print_str_no_nl");
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_print_str_no_nl");
        vm.lea(VReg.A0, "_str_quote");
        vm.call("_print_str_no_nl");
        vm.jmp(doneLabel);

        vm.label(isDataStringLabel);
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_print_value_no_nl");

        vm.label(doneLabel);
        vm.epilogue([VReg.S0, VReg.S1], 32);
    }

    // 打印 Promise（带换行）
    // A0 = promise 指针
    generatePrintPromise() {
        const vm = this.vm;

        vm.label("_print_promise");
        vm.prologue(32, [VReg.S0, VReg.S1]);
        vm.mov(VReg.S0, VReg.A0);

        // status: +8
        vm.load(VReg.S1, VReg.S0, 8);

        const pendingLabel = "_print_promise_pending";
        const fulfilledLabel = "_print_promise_fulfilled";
        const rejectedLabel = "_print_promise_rejected";
        const doneLabel = "_print_promise_done";

        // pending = 0
        vm.cmpImm(VReg.S1, 0);
        vm.jeq(pendingLabel);

        // fulfilled = 1
        vm.cmpImm(VReg.S1, 1);
        vm.jeq(fulfilledLabel);

        // rejected = 2
        vm.cmpImm(VReg.S1, 2);
        vm.jeq(rejectedLabel);

        // unknown -> 当作 pending
        vm.jmp(pendingLabel);

        vm.label(pendingLabel);
        vm.lea(VReg.A0, "_str_promise_pending");
        vm.call("_print_str");
        vm.jmp(doneLabel);

        vm.label(fulfilledLabel);
        vm.lea(VReg.A0, "_str_promise_fulfilled_full");
        vm.call("_print_str");
        vm.jmp(doneLabel);

        vm.label(rejectedLabel);
        vm.lea(VReg.A0, "_str_promise_rejected_full");
        vm.call("_print_str");
        vm.jmp(doneLabel);

        vm.label(doneLabel);
        vm.epilogue([VReg.S0, VReg.S1], 32);
    }

    // 打印 Promise（无换行）
    // A0 = promise 指针
    generatePrintPromiseNoNL() {
        const vm = this.vm;

        vm.label("_print_promise_no_nl");
        vm.prologue(32, [VReg.S0, VReg.S1]);
        vm.mov(VReg.S0, VReg.A0);

        vm.load(VReg.S1, VReg.S0, 8); // status

        const pendingLabel = "_print_promise_nl_pending";
        const fulfilledLabel = "_print_promise_nl_fulfilled";
        const rejectedLabel = "_print_promise_nl_rejected";
        const doneLabel = "_print_promise_nl_done";

        vm.cmpImm(VReg.S1, 0);
        vm.jeq(pendingLabel);
        vm.cmpImm(VReg.S1, 1);
        vm.jeq(fulfilledLabel);
        vm.cmpImm(VReg.S1, 2);
        vm.jeq(rejectedLabel);
        vm.jmp(pendingLabel);

        vm.label(pendingLabel);
        vm.lea(VReg.A0, "_str_promise_pending");
        vm.call("_print_str_no_nl");
        vm.jmp(doneLabel);

        vm.label(fulfilledLabel);
        vm.lea(VReg.A0, "_str_promise_fulfilled_full");
        vm.call("_print_str_no_nl");
        vm.jmp(doneLabel);

        vm.label(rejectedLabel);
        vm.lea(VReg.A0, "_str_promise_rejected_full");
        vm.call("_print_str_no_nl");
        vm.jmp(doneLabel);

        vm.label(doneLabel);
        vm.epilogue([VReg.S0, VReg.S1], 32);
    }

    // 打印值（无换行版本，用于数组元素）
    generatePrintValueNoNL() {
        const vm = this.vm;

        vm.label("_print_value_no_nl");
        vm.prologue(32, [VReg.S0, VReg.S1]);
        vm.mov(VReg.S0, VReg.A0);

        const notZeroLabel = "_print_vnl_not_zero";
        const doneLabel = "_print_vnl_done";
        const isNumberLabel = "_print_vnl_number";
        const isStringLabel = "_print_vnl_string";
        const isArrayLabel = "_print_vnl_array";
        const isPromiseLabel = "_print_vnl_promise";
        const checkDataStrLabel = "_print_vnl_check_data_str";
        const maybeFloatLabel = "_print_vnl_maybe_float";

        vm.cmpImm(VReg.S0, 0);
        vm.jne(notZeroLabel);
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_print_int_no_nl");
        vm.jmp(doneLabel);

        vm.label(notZeroLabel);
        vm.lea(VReg.V1, "_heap_base");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jlt(checkDataStrLabel);

        // 只有 heap_base <= ptr < heap_ptr 才认为是堆对象；否则很可能是浮点位模式
        vm.lea(VReg.V4, "_heap_ptr");
        vm.load(VReg.V4, VReg.V4, 0);
        vm.cmp(VReg.S0, VReg.V4);
        vm.jge(maybeFloatLabel);

        // 加载用户数据区的第一个字（类型标记在低 8 位）
        vm.load(VReg.V2, VReg.S0, 0);
        vm.andImm(VReg.V2, VReg.V2, 0xff);

        vm.movImm(VReg.V3, TYPE_ARRAY);
        vm.cmp(VReg.V2, VReg.V3);
        vm.jeq(isArrayLabel);

        vm.movImm(VReg.V3, TYPE_STRING);
        vm.cmp(VReg.V2, VReg.V3);
        vm.jeq(isStringLabel);

        vm.movImm(VReg.V3, TYPE_PROMISE);
        vm.cmp(VReg.V2, VReg.V3);
        vm.jeq(isPromiseLabel);

        // 检查是否是 Number 带子类型 (TYPE_NUMBER = 13)
        const isNumberSubtypeLabel = "_print_vnl_number_subtype";
        vm.cmpImm(VReg.V2, 13);
        vm.jeq(isNumberSubtypeLabel);

        // 检查是否是 TypedArray (0x40-0x61)
        const isTypedArrayLabel = "_print_vnl_typedarray";
        vm.cmpImm(VReg.V2, 0x40);
        vm.jge(isTypedArrayLabel);

        // 检查是否是 Number 类型 (TYPE_INT8=20 到 TYPE_FLOAT64=29)
        const isObjectLabel = "_print_vnl_object";
        vm.movImm(VReg.V3, TYPE_INT8);
        vm.cmp(VReg.V2, VReg.V3);
        vm.jlt(isObjectLabel); // 小于 20，未知类型当作对象
        vm.movImm(VReg.V3, TYPE_FLOAT64);
        vm.cmp(VReg.V2, VReg.V3);
        vm.jgt(isObjectLabel); // 大于 29，未知类型当作对象
        // 是 Number 对象
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_print_number_no_nl");
        vm.jmp(doneLabel);

        // Number 带子类型 (TYPE_NUMBER=13)：打印整数值
        vm.label(isNumberSubtypeLabel);
        vm.load(VReg.A0, VReg.S0, 8); // 加载值
        vm.call("_print_int_no_nl"); // 直接打印整数
        vm.jmp(doneLabel);

        // TypedArray
        vm.label(isTypedArrayLabel);
        vm.cmpImm(VReg.V2, 0x70);
        vm.jge(isObjectLabel); // 超出范围当作 object
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_print_typedarray_no_nl");
        vm.jmp(doneLabel);

        // 其他类型（对象、闭包等）
        vm.label(isObjectLabel);
        vm.lea(VReg.A0, "_str_object");
        vm.call("_print_str_no_nl");
        vm.jmp(doneLabel);

        vm.label(isStringLabel);
        // 堆分配字符串: 16 字节头部，内容从 +16 开始
        vm.addImm(VReg.A0, VReg.S0, 16);
        vm.call("_print_str_no_nl");
        vm.jmp(doneLabel);

        vm.label(isArrayLabel);
        // 嵌套数组暂时简化处理
        vm.lea(VReg.A0, "_str_array");
        vm.call("_print_str_no_nl");
        vm.jmp(doneLabel);

        vm.label(isPromiseLabel);
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_print_promise_no_nl");
        vm.jmp(doneLabel);

        vm.label(checkDataStrLabel);
        // 数据段地址通常很大，如果值 < 1MB 当作数字
        vm.movImm(VReg.V1, 0x100000);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jlt(isNumberLabel);

        vm.loadByte(VReg.V1, VReg.S0, 0);
        vm.cmpImm(VReg.V1, 32);
        vm.jlt(isNumberLabel);
        vm.cmpImm(VReg.V1, 127);
        vm.jge(isNumberLabel);

        vm.mov(VReg.A0, VReg.S0);
        vm.call("_print_str_no_nl");
        vm.jmp(doneLabel);

        vm.label(isNumberLabel);
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_print_int_no_nl");

        vm.label(maybeFloatLabel);
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_print_float_no_nl");

        vm.label(doneLabel);
        vm.epilogue([VReg.S0, VReg.S1], 32);
    }

    // 打印 TypedArray: "Float64Array(3) [1, 2.5, 3.14]"
    generatePrintTypedArray() {
        const vm = this.vm;

        vm.label("_print_typedarray");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        vm.mov(VReg.S0, VReg.A0); // arr

        // 加载 type 和 length
        vm.load(VReg.S1, VReg.S0, 0); // type
        vm.load(VReg.S2, VReg.S0, 8); // length

        // 根据 type 确定元素大小，存入 S4
        // 1字节: Int8Array(0x40), Uint8Array(0x50), Uint8ClampedArray(0x54)
        // 2字节: Int16Array(0x41), Uint16Array(0x51)
        // 4字节: Int32Array(0x42), Uint32Array(0x52), Float32Array(0x60)
        // 8字节: BigInt64Array(0x43), BigUint64Array(0x53), Float64Array(0x61)
        vm.movImm(VReg.S4, 8); // 默认 8 字节

        // 检查 1 字节类型
        vm.cmpImm(VReg.S1, 0x40); // Int8Array
        vm.jeq("_print_ta_1byte");
        vm.cmpImm(VReg.S1, 0x50); // Uint8Array
        vm.jeq("_print_ta_1byte");
        vm.cmpImm(VReg.S1, 0x54); // Uint8ClampedArray
        vm.jeq("_print_ta_1byte");

        // 检查 2 字节类型
        vm.cmpImm(VReg.S1, 0x41); // Int16Array
        vm.jeq("_print_ta_2byte");
        vm.cmpImm(VReg.S1, 0x51); // Uint16Array
        vm.jeq("_print_ta_2byte");

        // 检查 4 字节类型
        vm.cmpImm(VReg.S1, 0x42); // Int32Array
        vm.jeq("_print_ta_4byte");
        vm.cmpImm(VReg.S1, 0x52); // Uint32Array
        vm.jeq("_print_ta_4byte");
        vm.cmpImm(VReg.S1, 0x60); // Float32Array
        vm.jeq("_print_ta_4byte");

        // 默认 8 字节类型
        vm.jmp("_print_ta_header");

        vm.label("_print_ta_1byte");
        vm.movImm(VReg.S4, 1);
        vm.jmp("_print_ta_header");

        vm.label("_print_ta_2byte");
        vm.movImm(VReg.S4, 2);
        vm.jmp("_print_ta_header");

        vm.label("_print_ta_4byte");
        vm.movImm(VReg.S4, 4);
        vm.jmp("_print_ta_header");

        // 打印类型名称
        vm.label("_print_ta_header");
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_get_type_name");
        vm.mov(VReg.A0, VReg.RET);
        vm.call("_print_str_no_nl");

        // 打印 "(length) ["
        vm.movImm(VReg.A0, 40); // '('
        vm.call("_print_char");
        vm.mov(VReg.A0, VReg.S2);
        vm.call("_print_int_no_nl");
        vm.movImm(VReg.A0, 41); // ')'
        vm.call("_print_char");
        vm.movImm(VReg.A0, 32); // ' '
        vm.call("_print_char");
        vm.movImm(VReg.A0, 91); // '['
        vm.call("_print_char");

        // 打印元素，使用 S3 作为循环计数器，S5 作为当前偏移
        vm.movImm(VReg.S3, 0); // i = 0
        vm.movImm(VReg.S5, 16); // offset = 16 (header size)

        vm.label("_print_ta_loop");
        vm.cmp(VReg.S3, VReg.S2);
        vm.jge("_print_ta_done");

        // 打印逗号分隔符 (除了第一个元素)
        vm.cmpImm(VReg.S3, 0);
        vm.jeq("_print_ta_elem");
        vm.lea(VReg.A0, "_str_comma");
        vm.call("_print_str_no_nl");

        vm.label("_print_ta_elem");
        // 计算元素地址: arr + offset
        vm.add(VReg.V0, VReg.S0, VReg.S5);

        // 根据类型选择加载方式并打印
        // Float64Array (0x61): 加载 8 字节，打印浮点
        vm.cmpImm(VReg.S1, 0x61);
        vm.jeq("_print_ta_float64");

        // Float32Array (0x60): 加载 4 字节，打印浮点
        vm.cmpImm(VReg.S1, 0x60);
        vm.jeq("_print_ta_float32");

        // 整数类型：加载字节并组装
        // 1 字节有符号: Int8Array (0x40)
        vm.cmpImm(VReg.S1, 0x40);
        vm.jeq("_print_ta_int8");

        // 1 字节无符号: Uint8Array (0x50), Uint8ClampedArray (0x54)
        vm.cmpImm(VReg.S1, 0x50);
        vm.jeq("_print_ta_uint8");
        vm.cmpImm(VReg.S1, 0x54);
        vm.jeq("_print_ta_uint8");

        // 2 字节有符号: Int16Array (0x41)
        vm.cmpImm(VReg.S1, 0x41);
        vm.jeq("_print_ta_int16");

        // 2 字节无符号: Uint16Array (0x51)
        vm.cmpImm(VReg.S1, 0x51);
        vm.jeq("_print_ta_uint16");

        // 4 字节有符号: Int32Array (0x42)
        vm.cmpImm(VReg.S1, 0x42);
        vm.jeq("_print_ta_int32");

        // 4 字节无符号: Uint32Array (0x52)
        vm.cmpImm(VReg.S1, 0x52);
        vm.jeq("_print_ta_uint32");

        // 8 字节有符号: BigInt64Array (0x43)
        vm.cmpImm(VReg.S1, 0x43);
        vm.jeq("_print_ta_int64");

        // 8 字节无符号: BigUint64Array (0x53) - 默认
        vm.load(VReg.A0, VReg.V0, 0);
        vm.call("_print_int_no_nl");
        vm.jmp("_print_ta_next");

        // Float64Array
        vm.label("_print_ta_float64");
        vm.load(VReg.A0, VReg.V0, 0);
        vm.call("_print_float_no_nl");
        vm.jmp("_print_ta_next");

        // Float32Array - 加载 4 字节，转换为 double 打印
        vm.label("_print_ta_float32");
        vm.loadByte(VReg.V1, VReg.V0, 0);
        vm.loadByte(VReg.V2, VReg.V0, 1);
        vm.shl(VReg.V2, VReg.V2, 8);
        vm.or(VReg.V1, VReg.V1, VReg.V2);
        vm.loadByte(VReg.V2, VReg.V0, 2);
        vm.shl(VReg.V2, VReg.V2, 16);
        vm.or(VReg.V1, VReg.V1, VReg.V2);
        vm.loadByte(VReg.V2, VReg.V0, 3);
        vm.shl(VReg.V2, VReg.V2, 24);
        vm.or(VReg.A0, VReg.V1, VReg.V2);
        vm.call("_print_float32_no_nl");
        vm.jmp("_print_ta_next");

        // Int8Array - 有符号 1 字节
        vm.label("_print_ta_int8");
        vm.loadByte(VReg.A0, VReg.V0, 0);
        // 符号扩展: 如果 bit 7 = 1, 则扩展为负数
        vm.andImm(VReg.V1, VReg.A0, 0x80);
        vm.cmpImm(VReg.V1, 0);
        vm.jeq("_print_ta_int8_pos");
        // 负数：扩展为 64 位
        vm.orImm(VReg.A0, VReg.A0, -256); // 0xFFFFFFFFFFFFFF00
        vm.label("_print_ta_int8_pos");
        vm.call("_print_int_no_nl");
        vm.jmp("_print_ta_next");

        // Uint8Array - 无符号 1 字节
        vm.label("_print_ta_uint8");
        vm.loadByte(VReg.A0, VReg.V0, 0);
        vm.call("_print_int_no_nl");
        vm.jmp("_print_ta_next");

        // Int16Array - 有符号 2 字节
        vm.label("_print_ta_int16");
        vm.loadByte(VReg.V1, VReg.V0, 0);
        vm.loadByte(VReg.V2, VReg.V0, 1);
        vm.shl(VReg.V2, VReg.V2, 8);
        vm.or(VReg.A0, VReg.V1, VReg.V2);
        // 符号扩展
        vm.andImm(VReg.V1, VReg.A0, 0x8000);
        vm.cmpImm(VReg.V1, 0);
        vm.jeq("_print_ta_int16_pos");
        vm.orImm(VReg.A0, VReg.A0, -65536); // 0xFFFFFFFFFFFF0000
        vm.label("_print_ta_int16_pos");
        vm.call("_print_int_no_nl");
        vm.jmp("_print_ta_next");

        // Uint16Array - 无符号 2 字节
        vm.label("_print_ta_uint16");
        vm.loadByte(VReg.V1, VReg.V0, 0);
        vm.loadByte(VReg.V2, VReg.V0, 1);
        vm.shl(VReg.V2, VReg.V2, 8);
        vm.or(VReg.A0, VReg.V1, VReg.V2);
        vm.call("_print_int_no_nl");
        vm.jmp("_print_ta_next");

        // Int32Array - 有符号 4 字节
        vm.label("_print_ta_int32");
        vm.loadByte(VReg.V1, VReg.V0, 0);
        vm.loadByte(VReg.V2, VReg.V0, 1);
        vm.shl(VReg.V2, VReg.V2, 8);
        vm.or(VReg.V1, VReg.V1, VReg.V2);
        vm.loadByte(VReg.V2, VReg.V0, 2);
        vm.shl(VReg.V2, VReg.V2, 16);
        vm.or(VReg.V1, VReg.V1, VReg.V2);
        vm.loadByte(VReg.V2, VReg.V0, 3);
        vm.shl(VReg.V2, VReg.V2, 24);
        vm.or(VReg.A0, VReg.V1, VReg.V2);
        // 符号扩展 32->64 位
        vm.shl(VReg.A0, VReg.A0, 32);
        vm.sar(VReg.A0, VReg.A0, 32);
        vm.call("_print_int_no_nl");
        vm.jmp("_print_ta_next");

        // Uint32Array - 无符号 4 字节
        vm.label("_print_ta_uint32");
        vm.loadByte(VReg.V1, VReg.V0, 0);
        vm.loadByte(VReg.V2, VReg.V0, 1);
        vm.shl(VReg.V2, VReg.V2, 8);
        vm.or(VReg.V1, VReg.V1, VReg.V2);
        vm.loadByte(VReg.V2, VReg.V0, 2);
        vm.shl(VReg.V2, VReg.V2, 16);
        vm.or(VReg.V1, VReg.V1, VReg.V2);
        vm.loadByte(VReg.V2, VReg.V0, 3);
        vm.shl(VReg.V2, VReg.V2, 24);
        vm.or(VReg.A0, VReg.V1, VReg.V2);
        vm.call("_print_int_no_nl");
        vm.jmp("_print_ta_next");

        // BigInt64Array - 8 字节有符号
        vm.label("_print_ta_int64");
        vm.load(VReg.A0, VReg.V0, 0);
        vm.call("_print_int_no_nl");
        vm.jmp("_print_ta_next");

        // 下一个元素
        vm.label("_print_ta_next");
        vm.addImm(VReg.S3, VReg.S3, 1); // i++
        vm.add(VReg.S5, VReg.S5, VReg.S4); // offset += elemSize
        vm.jmp("_print_ta_loop");

        vm.label("_print_ta_done");
        // 打印 "]" 和换行
        vm.movImm(VReg.A0, 93); // ']'
        vm.call("_print_char");
        vm.call("_print_nl");

        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 48);
    }

    // 打印 TypedArray（无换行版本，简化为 "[TypedArray]"）
    generatePrintTypedArrayNoNL() {
        const vm = this.vm;

        vm.label("_print_typedarray_no_nl");
        vm.prologue(16, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0);

        // 打印类型名和基本信息
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_get_type_name");
        vm.mov(VReg.A0, VReg.RET);
        vm.call("_print_str_no_nl");

        // 打印 "(length) [...]"
        vm.load(VReg.V0, VReg.S0, 8); // length
        vm.movImm(VReg.A0, 40); // '('
        vm.call("_print_char");
        vm.mov(VReg.A0, VReg.V0);
        vm.call("_print_int_no_nl");
        vm.lea(VReg.A0, "_str_typedarray_abbrev"); // ") [...]"
        vm.call("_print_str_no_nl");

        vm.epilogue([VReg.S0], 16);
    }

    // 打印 ArrayBuffer: "ArrayBuffer { byteLength: N }"
    generatePrintArrayBuffer() {
        const vm = this.vm;

        vm.label("_print_arraybuffer");
        vm.prologue(16, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0); // buf

        // 打印 "ArrayBuffer { byteLength: "
        vm.lea(VReg.A0, "_str_ArrayBuffer");
        vm.call("_print_str_no_nl");
        vm.lea(VReg.A0, "_str_arraybuffer_open");
        vm.call("_print_str_no_nl");

        // 打印长度
        vm.load(VReg.A0, VReg.S0, 8);
        vm.call("_print_int_no_nl");

        // 打印 " }" 和换行
        vm.lea(VReg.A0, "_str_arraybuffer_close");
        vm.call("_print_str_no_nl");
        vm.call("_print_nl");

        vm.epilogue([VReg.S0], 16);
    }

    // 打印单个字符
    generatePrintChar() {
        const vm = this.vm;

        vm.label("_print_char");
        vm.prologue(16, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0); // char code

        // 写入到临时缓冲区
        vm.lea(VReg.V0, "_print_buf");
        vm.storeByte(VReg.V0, 0, VReg.S0);

        // 调用 write(1, buf, 1)
        vm.movImm(VReg.A0, 1); // fd = stdout
        vm.lea(VReg.A1, "_print_buf");
        vm.movImm(VReg.A2, 1); // len = 1
        this.emitWriteCall();

        vm.epilogue([VReg.S0], 16);
    }

    generate() {
        this.generatePrintStringNoNL();
        this.generatePrintString();
        this.generatePrintNewline();
        this.generatePrintBool();
        this.generatePrintBoolNoNL();
        this.generatePrintSpace();
        this.generatePrintWrapper();
        this.generatePrintValue();
        this.generatePrintArray();
        this.generatePrintArrayElemNoNL();
        this.generatePrintPromise();
        this.generatePrintPromiseNoNL();
        this.generatePrintValueNoNL();
        this.generatePrintTypedArray();
        this.generatePrintTypedArrayNoNL();
        this.generatePrintArrayBuffer();
        this.generatePrintChar();
    }
}
