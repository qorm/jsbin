// JSBin 字符串运行时 - 类型转换
// 提供字符串与其他类型的转换函数

import { VReg } from "../../../vm/registers.js";

// 类型转换生成器 Mixin
export const StringConvertGenerator = {
    // 整数转字符串
    // _intToStr(n) -> str（带TYPE_STRING标记）
    generateIntToStr() {
        const vm = this.vm;

        vm.label("_intToStr");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // S0 = 输入数字

        // 分配 24 字节缓冲区（纯内容，无头部）
        vm.movImm(VReg.A0, 24);
        vm.call("_alloc");
        vm.mov(VReg.S4, VReg.RET); // S4 = 分配的内存起始

        // S1 = 写入位置（直接从开始）
        vm.mov(VReg.S1, VReg.S4);
        vm.mov(VReg.S3, VReg.S1); // S3 = 保存起始位置

        // 处理负数
        const positiveLabel = "_intToStr_positive";
        vm.cmpImm(VReg.S0, 0);
        vm.jge(positiveLabel);

        // 写 '-'
        vm.movImm(VReg.V0, 45); // '-'
        vm.storeByte(VReg.S1, 0, VReg.V0);
        vm.addImm(VReg.S1, VReg.S1, 1);
        // 取反
        vm.movImm(VReg.V0, 0);
        vm.sub(VReg.S0, VReg.V0, VReg.S0);

        vm.label(positiveLabel);

        // 处理 0 的特殊情况
        const notZeroLabel = "_intToStr_notZero";
        const endLabel = "_intToStr_end";
        vm.cmpImm(VReg.S0, 0);
        vm.jne(notZeroLabel);
        vm.movImm(VReg.V0, 48); // '0'
        vm.storeByte(VReg.S1, 0, VReg.V0);
        vm.movImm(VReg.V0, 0);
        vm.storeByte(VReg.S1, 1, VReg.V0);
        vm.jmp(endLabel);

        vm.label(notZeroLabel);

        // 使用临时栈存储数字（逆序）
        vm.movImm(VReg.S2, 0); // S2 = 位数计数

        // 循环取每位数字（从低到高）
        const pushLoop = "_intToStr_pushLoop";
        const pushDone = "_intToStr_pushDone";
        vm.label(pushLoop);
        vm.cmpImm(VReg.S0, 0);
        vm.jeq(pushDone);

        vm.movImm(VReg.V1, 10);
        vm.mod(VReg.V0, VReg.S0, VReg.V1); // V0 = 当前位
        // 重要：在 div 之前先处理 V0，因为 x64 的 div 会覆盖 RAX (V0)
        vm.addImm(VReg.V0, VReg.V0, 48); // + '0'
        vm.push(VReg.V0);
        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.div(VReg.S0, VReg.S0, VReg.V1); // S0 = 剩余数字
        vm.jmp(pushLoop);

        vm.label(pushDone);

        // 从栈中弹出并写入 buffer（正序）
        const popLoop = "_intToStr_popLoop";
        const popDone = "_intToStr_popDone";
        vm.label(popLoop);
        vm.cmpImm(VReg.S2, 0);
        vm.jeq(popDone);

        vm.pop(VReg.V0);
        vm.storeByte(VReg.S1, 0, VReg.V0);
        vm.addImm(VReg.S1, VReg.S1, 1);
        vm.subImm(VReg.S2, VReg.S2, 1);
        vm.jmp(popLoop);

        vm.label(popDone);

        // 写入结束符
        vm.movImm(VReg.V0, 0);
        vm.storeByte(VReg.S1, 0, VReg.V0);

        vm.label(endLabel);
        // 直接返回 char* 指针
        vm.mov(VReg.RET, VReg.S4);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 64);
    },

    // 布尔值转字符串
    // _boolToStr(b) -> str
    generateBoolToStr() {
        const vm = this.vm;

        vm.label("_boolToStr");

        const falseLabel = "_boolToStr_false";
        const endLabel = "_boolToStr_end";

        vm.cmpImm(VReg.A0, 0);
        vm.jeq(falseLabel);

        // true
        vm.lea(VReg.RET, "_str_true");
        vm.jmp(endLabel);

        vm.label(falseLabel);
        // false
        vm.lea(VReg.RET, "_str_false");

        vm.label(endLabel);
        vm.ret();
    },

    // 通用 toString（简化版）
    // _toString(v) -> str
    generateToString() {
        const vm = this.vm;

        vm.label("_toString");
        // 简单实现：返回 "[object Object]"
        vm.lea(VReg.RET, "_str_object");
        vm.ret();
    },

    // 智能值转字符串
    // _valueToStr(v) -> str
    // 检测值类型并转换为字符串
    generateValueToStr() {
        const vm = this.vm;
        const TYPE_STRING = 6;
        const TYPE_NUMBER = 13;
        const TYPE_FLOAT64 = 29;
        const TYPE_ERROR = 31;

        vm.label("_valueToStr");
        vm.prologue(16, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0); // S0 = 值

        // 检查是否在代码/数据段范围内（字符串指针）
        vm.lea(VReg.V0, "_heap_base");
        vm.load(VReg.V0, VReg.V0, 0);
        vm.cmp(VReg.S0, VReg.V0);
        vm.jge("_valueToStr_check_heap");

        // 地址 < heap_base，检查是否是合理的数据段地址
        vm.movImm(VReg.V0, 0x100000);
        vm.cmp(VReg.S0, VReg.V0);
        vm.jlt("_valueToStr_as_raw_number");

        // 看起来是数据段字符串指针
        vm.jmp("_valueToStr_as_string");

        vm.label("_valueToStr_check_heap");
        // 检查是否在堆范围内
        vm.lea(VReg.V0, "_heap_ptr");
        vm.load(VReg.V0, VReg.V0, 0);
        vm.cmp(VReg.S0, VReg.V0);
        vm.jge("_valueToStr_as_raw_number");

        // 在堆范围内，检查对象类型
        vm.load(VReg.V1, VReg.S0, 0);
        vm.andImm(VReg.V1, VReg.V1, 0xff);

        // 检查是否是字符串 (type=6)
        vm.cmpImm(VReg.V1, TYPE_STRING);
        vm.jeq("_valueToStr_as_string");

        // 检查是否是 Number 对象 (type=13)
        vm.cmpImm(VReg.V1, TYPE_NUMBER);
        vm.jeq("_valueToStr_as_number_obj");

        // 检查是否是 FLOAT64 对象 (type=29)
        vm.cmpImm(VReg.V1, TYPE_FLOAT64);
        vm.jeq("_valueToStr_as_number_obj");

        // 检查是否是 Error 对象 (type=31)
        vm.cmpImm(VReg.V1, TYPE_ERROR);
        vm.jeq("_valueToStr_as_error_obj");

        // 其他堆对象，当作原始数字处理（不太可能）
        vm.jmp("_valueToStr_as_raw_number");

        // Error 对象: [type:8][message:8][name:8][stack:8][cause:8]
        vm.label("_valueToStr_as_error_obj");
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_error_to_string");
        vm.epilogue([VReg.S0], 16);

        // Number 对象: [type:8][float64_bits:8]
        vm.label("_valueToStr_as_number_obj");
        // 加载 offset 8 处的 float64 位表示
        vm.load(VReg.S0, VReg.S0, 8);
        // 继续到浮点转字符串逻辑
        vm.label("_valueToStr_as_raw_number");
        // 将值当作浮点位表示，转换为整数后调用 _intToStr
        vm.fmovToFloat(0, VReg.S0);
        vm.fcvtzs(VReg.A0, 0);
        vm.call("_intToStr");
        vm.epilogue([VReg.S0], 16);

        vm.label("_valueToStr_as_string");
        // 直接返回字符串指针
        vm.mov(VReg.RET, VReg.S0);
        vm.epilogue([VReg.S0], 16);
    },
};
