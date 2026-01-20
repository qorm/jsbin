// JSBin 字符串运行时
// 提供字符串操作函数

import { VReg } from "../../../vm/registers.js";

export class StringGenerator {
    constructor(vm) {
        this.vm = vm;
    }

    // 生成字符串长度函数
    // _strlen(str) -> length
    generateStrlen() {
        const vm = this.vm;

        vm.label("_strlen");
        vm.prologue(0, [VReg.S0, VReg.S1]);

        // S0 = str pointer
        // S1 = counter
        vm.mov(VReg.S0, VReg.A0);
        vm.movImm(VReg.S1, 0);

        const loopLabel = "_strlen_loop";
        const doneLabel = "_strlen_done";

        vm.label(loopLabel);
        // 加载当前字符（单字节）
        vm.loadByte(VReg.V0, VReg.S0, 0);
        // 检查是否为 0
        vm.cmpImm(VReg.V0, 0);
        vm.jeq(doneLabel);
        // 计数器 +1
        vm.addImm(VReg.S1, VReg.S1, 1);
        // 指针 +1
        vm.addImm(VReg.S0, VReg.S0, 1);
        vm.jmp(loopLabel);

        vm.label(doneLabel);
        vm.mov(VReg.RET, VReg.S1);
        vm.epilogue([VReg.S0, VReg.S1], 0);
    }

    // 生成字符串比较函数
    // _strcmp(s1, s2) -> 0 if equal, non-zero otherwise
    generateStrcmp() {
        const vm = this.vm;

        vm.label("_strcmp");
        vm.prologue(0, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);

        const loopLabel = "_strcmp_loop";
        const notEqualLabel = "_strcmp_ne";
        const doneLabel = "_strcmp_done";

        vm.label(loopLabel);
        // 加载两个字符（使用 loadByte 加载单字节）
        vm.loadByte(VReg.V0, VReg.S0, 0);
        vm.loadByte(VReg.V1, VReg.S1, 0);

        // 比较
        vm.cmp(VReg.V0, VReg.V1);
        vm.jne(notEqualLabel);

        // 如果都是 0，相等
        vm.cmpImm(VReg.V0, 0);
        vm.jeq(doneLabel);

        // 继续
        vm.addImm(VReg.S0, VReg.S0, 1);
        vm.addImm(VReg.S1, VReg.S1, 1);
        vm.jmp(loopLabel);

        vm.label(notEqualLabel);
        vm.sub(VReg.RET, VReg.V0, VReg.V1);
        vm.epilogue([VReg.S0, VReg.S1], 0);

        vm.label(doneLabel);
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1], 0);
    }

    // 生成字符串复制函数
    // _strcpy(dest, src) -> dest
    generateStrcpy() {
        const vm = this.vm;

        vm.label("_strcpy");
        vm.prologue(0, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // dest
        vm.mov(VReg.S1, VReg.A1); // src
        vm.mov(VReg.S2, VReg.A0); // 保存原始 dest

        const loopLabel = "_strcpy_loop";
        const doneLabel = "_strcpy_done";

        vm.label(loopLabel);
        vm.loadByte(VReg.V0, VReg.S1, 0);
        vm.storeByte(VReg.S0, 0, VReg.V0);

        vm.cmpImm(VReg.V0, 0);
        vm.jeq(doneLabel);

        vm.addImm(VReg.S0, VReg.S0, 1);
        vm.addImm(VReg.S1, VReg.S1, 1);
        vm.jmp(loopLabel);

        vm.label(doneLabel);
        vm.mov(VReg.RET, VReg.S2);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 0);
    }

    // 生成字符串连接函数
    // _strcat(dest, src) -> dest
    generateStrcat() {
        const vm = this.vm;

        vm.label("_strcat");
        vm.prologue(0, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // dest
        vm.mov(VReg.S1, VReg.A1); // src
        vm.mov(VReg.S2, VReg.A0); // 保存原始 dest

        // 找到 dest 的末尾
        const findEndLabel = "_strcat_find_end";
        const copyLabel = "_strcat_copy";
        const doneLabel = "_strcat_done";

        vm.label(findEndLabel);
        vm.loadByte(VReg.V0, VReg.S0, 0);
        vm.cmpImm(VReg.V0, 0);
        vm.jeq(copyLabel);
        vm.addImm(VReg.S0, VReg.S0, 1);
        vm.jmp(findEndLabel);

        // 复制 src 到末尾
        vm.label(copyLabel);
        vm.loadByte(VReg.V0, VReg.S1, 0);
        vm.storeByte(VReg.S0, 0, VReg.V0);

        vm.cmpImm(VReg.V0, 0);
        vm.jeq(doneLabel);

        vm.addImm(VReg.S0, VReg.S0, 1);
        vm.addImm(VReg.S1, VReg.S1, 1);
        vm.jmp(copyLabel);

        vm.label(doneLabel);
        vm.mov(VReg.RET, VReg.S2);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 0);
    }

    // 获取字符串长度
    // 智能处理堆字符串（有头部）和数据段字符串（无头部）
    // _str_length(str) -> length
    generateStrLength() {
        const vm = this.vm;
        const TYPE_STRING = 6;

        vm.label("_str_length");
        vm.prologue(0, [VReg.S0]);
        vm.mov(VReg.S0, VReg.A0);

        // 检查是否在堆范围内
        vm.lea(VReg.V1, "_heap_base");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.S0, VReg.V1);
        const notHeapLabel = "_str_length_not_heap";
        const doneLabel = "_str_length_done";
        vm.jlt(notHeapLabel);

        vm.lea(VReg.V1, "_heap_ptr");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jge(notHeapLabel);

        // 在堆范围内，检查类型标记
        vm.load(VReg.V2, VReg.S0, 0);
        vm.andImm(VReg.V2, VReg.V2, 0xff);
        vm.movImm(VReg.V3, TYPE_STRING);
        vm.cmp(VReg.V2, VReg.V3);
        vm.jne(notHeapLabel);

        // 是堆字符串，从 +8 位置读取长度
        vm.load(VReg.RET, VReg.S0, 8);
        vm.jmp(doneLabel);

        vm.label(notHeapLabel);
        // 数据段字符串，使用 strlen 计算
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_strlen");

        vm.label(doneLabel);
        vm.epilogue([VReg.S0], 0);
    }

    // 获取字符串内容指针
    // 如果是堆字符串（有TYPE_STRING标记），返回 +16 偏移（跳过 type + length）
    // 如果是数据段字符串，直接返回原指针
    // _getStrContent(str) -> content_ptr
    generateGetStrContent() {
        const vm = this.vm;
        const TYPE_STRING = 6;

        vm.label("_getStrContent");
        vm.prologue(0, [VReg.S0]);
        vm.mov(VReg.S0, VReg.A0);

        // 检查是否在堆范围内
        vm.lea(VReg.V1, "_heap_base");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.S0, VReg.V1);
        const notHeapLabel = "_getStrContent_not_heap";
        const doneLabel = "_getStrContent_done";
        vm.jlt(notHeapLabel);

        vm.lea(VReg.V1, "_heap_ptr");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jge(notHeapLabel);

        // 在堆范围内，检查类型标记
        vm.load(VReg.V2, VReg.S0, 0);
        vm.andImm(VReg.V2, VReg.V2, 0xff);
        vm.movImm(VReg.V3, TYPE_STRING);
        vm.cmp(VReg.V2, VReg.V3);
        vm.jne(notHeapLabel);

        // 是堆字符串，返回 +16 偏移（跳过 type + length）
        vm.addImm(VReg.RET, VReg.S0, 16);
        vm.jmp(doneLabel);

        vm.label(notHeapLabel);
        // 数据段字符串，直接返回
        vm.mov(VReg.RET, VReg.S0);

        vm.label(doneLabel);
        vm.epilogue([VReg.S0], 0);
    }

    // 生成字符串连接函数（分配新内存）
    // _strconcat(s1, s2) -> 新字符串（带TYPE_STRING标记）
    generateStrconcat() {
        const vm = this.vm;
        const TYPE_STRING = 6;

        vm.label("_strconcat");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // S0 = s1
        vm.mov(VReg.S1, VReg.A1); // S1 = s2

        // 获取 s1 的实际内容指针
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_getStrContent");
        vm.mov(VReg.S0, VReg.RET);

        // 获取 s2 的实际内容指针
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_getStrContent");
        vm.mov(VReg.S1, VReg.RET);

        // 分配 272 字节（16字节头部 + 256字节内容）
        vm.movImm(VReg.A0, 272);
        vm.call("_alloc");
        vm.mov(VReg.S2, VReg.RET); // S2 = 新分配的内存

        // 写入类型标记
        vm.movImm(VReg.V0, TYPE_STRING);
        vm.store(VReg.S2, 0, VReg.V0);
        // length 字段稍后填充

        // S3 = 内容起始位置（+16偏移）
        vm.addImm(VReg.S3, VReg.S2, 16);

        // 复制 s1 到内容区域
        vm.mov(VReg.A0, VReg.S3);
        vm.mov(VReg.A1, VReg.S0);
        vm.call("_strcpy");

        // 追加 s2
        vm.mov(VReg.A0, VReg.S3);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_strcat");

        // 计算并存储 length
        vm.mov(VReg.A0, VReg.S3);
        vm.call("_strlen");
        vm.store(VReg.S2, 8, VReg.RET);

        // 返回新字符串指针（包含类型标记）
        vm.mov(VReg.RET, VReg.S2);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 64);
    }

    // 整数转字符串
    // _intToStr(n) -> str（带TYPE_STRING标记）
    generateIntToStr() {
        const vm = this.vm;
        const TYPE_STRING = 6;

        vm.label("_intToStr");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // S0 = 输入数字

        // 分配 40 字节缓冲区（16字节头部 + 24字节内容）
        vm.movImm(VReg.A0, 40);
        vm.call("_alloc");
        vm.mov(VReg.S4, VReg.RET); // S4 = 分配的内存起始

        // 写入类型标记
        vm.movImm(VReg.V0, TYPE_STRING);
        vm.store(VReg.S4, 0, VReg.V0);
        // length 字段稍后填充

        // S1 = 内容写入位置（跳过16字节头部）
        vm.addImm(VReg.S1, VReg.S4, 16);
        vm.mov(VReg.S3, VReg.S1); // S3 = 保存内容起始位置

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
        vm.div(VReg.S0, VReg.S0, VReg.V1); // S0 = 剩余数字
        vm.addImm(VReg.V0, VReg.V0, 48); // + '0'
        vm.push(VReg.V0);
        vm.addImm(VReg.S2, VReg.S2, 1);
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
        // 计算并存储 length
        vm.addImm(VReg.A0, VReg.S4, 16); // 内容起始
        vm.call("_strlen");
        vm.store(VReg.S4, 8, VReg.RET); // 存储 length

        vm.mov(VReg.RET, VReg.S4); // 返回带类型头的指针
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 64);
    }

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
    }

    // 通用 toString（简化版）
    // _toString(v) -> str
    generateToString() {
        const vm = this.vm;

        vm.label("_toString");
        // 简单实现：返回 "[object Object]"
        vm.lea(VReg.RET, "_str_object");
        vm.ret();
    }

    // 智能值转字符串
    // _valueToStr(v) -> str
    // 检测值类型并转换为字符串
    generateValueToStr() {
        const vm = this.vm;
        const TYPE_STRING = 6;
        const TYPE_NUMBER = 13;

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

        // 其他堆对象，当作原始数字处理（不太可能）
        vm.jmp("_valueToStr_as_raw_number");

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
    }

    // 字符串转大写
    // _str_toUpperCase(str) -> 新字符串（带类型标记）
    generateToUpperCase() {
        const vm = this.vm;
        const TYPE_STRING = 6;

        vm.label("_str_toUpperCase");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // S0 = 源字符串

        // 计算长度
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_strlen");
        vm.mov(VReg.S1, VReg.RET); // S1 = 长度

        // 分配新字符串（16 字节头 + len + 1）
        vm.addImm(VReg.A0, VReg.S1, 17);
        vm.call("_alloc");
        vm.mov(VReg.S2, VReg.RET); // S2 = 新内存

        // 写入类型标记
        vm.movImm(VReg.V0, TYPE_STRING);
        vm.store(VReg.S2, 0, VReg.V0);
        // 写入 length
        vm.store(VReg.S2, 8, VReg.S1);

        // S3 = 字符串内容起始位置（+16）
        vm.addImm(VReg.S3, VReg.S2, 16);

        // 简单复制：先复制原字符串到新位置
        vm.mov(VReg.A0, VReg.S3);
        vm.mov(VReg.A1, VReg.S0);
        vm.call("_strcpy");

        // 然后就地转换为大写
        const loopLabel = "_toUpperCase_loop2";
        const doneLabel = "_toUpperCase_done2";
        const notLowerLabel = "_toUpperCase_not_lower2";

        vm.movImm(VReg.V1, 0); // V1 = index

        vm.label(loopLabel);
        vm.cmp(VReg.V1, VReg.S1);
        vm.jge(doneLabel);

        // 计算当前位置
        vm.add(VReg.V2, VReg.S3, VReg.V1);

        // 加载字符
        vm.loadByte(VReg.V3, VReg.V2, 0);

        // 检查是否是小写字母 (a-z: 97-122)
        vm.cmpImm(VReg.V3, 97);
        vm.jlt(notLowerLabel);
        vm.cmpImm(VReg.V3, 122);
        vm.jgt(notLowerLabel);

        // 转大写: -32
        vm.subImm(VReg.V3, VReg.V3, 32);
        // 写回
        vm.storeByte(VReg.V2, 0, VReg.V3);

        vm.label(notLowerLabel);
        vm.addImm(VReg.V1, VReg.V1, 1);
        vm.jmp(loopLabel);

        vm.label(doneLabel);
        vm.mov(VReg.RET, VReg.S2);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 64);
    }

    // 字符串转小写
    // _str_toLowerCase(str) -> 新字符串（带类型标记）
    generateToLowerCase() {
        const vm = this.vm;
        const TYPE_STRING = 6;

        vm.label("_str_toLowerCase");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // S0 = 源字符串

        // 计算长度
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_strlen");
        vm.mov(VReg.S1, VReg.RET); // S1 = 长度

        // 分配 len + 16 + 1 字节
        vm.addImm(VReg.A0, VReg.S1, 17);
        vm.call("_alloc");
        vm.mov(VReg.S2, VReg.RET); // S2 = 新内存

        // 写入类型标记和 length
        vm.movImm(VReg.V0, TYPE_STRING);
        vm.store(VReg.S2, 0, VReg.V0);
        vm.store(VReg.S2, 8, VReg.S1);

        // S3 = 内容起始（+16）
        vm.addImm(VReg.S3, VReg.S2, 16);

        // 循环转换每个字符
        const loopLabel = "_toLowerCase_loop";
        const doneLabel = "_toLowerCase_done";
        const notUpperLabel = "_toLowerCase_not_upper";

        vm.movImm(VReg.V1, 0); // V1 = index

        vm.label(loopLabel);
        vm.cmp(VReg.V1, VReg.S1);
        vm.jge(doneLabel);

        // 加载字符
        vm.add(VReg.V2, VReg.S0, VReg.V1);
        vm.loadByte(VReg.V3, VReg.V2, 0);

        // 检查是否是大写字母 (A-Z: 65-90)
        vm.cmpImm(VReg.V3, 65);
        vm.jlt(notUpperLabel);
        vm.cmpImm(VReg.V3, 90);
        vm.jgt(notUpperLabel);

        // 转小写: +32
        vm.addImm(VReg.V3, VReg.V3, 32);

        vm.label(notUpperLabel);
        // 存储到目标位置
        vm.add(VReg.V2, VReg.S3, VReg.V1);
        vm.storeByte(VReg.V2, 0, VReg.V3);

        vm.addImm(VReg.V1, VReg.V1, 1);
        vm.jmp(loopLabel);

        vm.label(doneLabel);
        // 写入结尾 null
        vm.add(VReg.V2, VReg.S3, VReg.S1);
        vm.movImm(VReg.V0, 0);
        vm.storeByte(VReg.V2, 0, VReg.V0);

        vm.mov(VReg.RET, VReg.S2);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 64);
    }

    // 获取指定位置的字符
    // _str_charAt(str, index) -> 单字符字符串
    generateCharAt() {
        const vm = this.vm;
        const TYPE_STRING = 6;

        vm.label("_str_charAt");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // S0 = 原始字符串指针
        vm.mov(VReg.S1, VReg.A1); // S1 = index

        // 获取字符串内容指针 (A0 已经是字符串指针)
        vm.call("_getStrContent");
        vm.mov(VReg.S2, VReg.RET); // S2 = 内容指针

        // 分配 18 字节（16 字节头部 + 1 字符 + 1 null）
        vm.movImm(VReg.A0, 18);
        vm.call("_alloc");
        vm.mov(VReg.V0, VReg.RET); // V0 = 新字符串

        // 写入类型标记
        vm.movImm(VReg.V1, TYPE_STRING);
        vm.store(VReg.V0, 0, VReg.V1);
        // 写入 length = 1
        vm.movImm(VReg.V1, 1);
        vm.store(VReg.V0, 8, VReg.V1);

        // 获取字符 (内容指针 + index)
        vm.add(VReg.V2, VReg.S2, VReg.S1);
        vm.loadByte(VReg.V3, VReg.V2, 0);

        // 写入字符到 +16 位置
        vm.storeByte(VReg.V0, 16, VReg.V3);
        // 写入 null 终止符
        vm.movImm(VReg.V3, 0);
        vm.storeByte(VReg.V0, 17, VReg.V3);

        vm.mov(VReg.RET, VReg.V0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    }

    // 获取指定位置的字符编码
    // _str_charCodeAt(str, index) -> 整数
    generateCharCodeAt() {
        const vm = this.vm;

        vm.label("_str_charCodeAt");
        vm.prologue(0, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A1); // S0 = index

        // A0 已经是字符串指针，获取内容指针
        vm.call("_getStrContent");
        // RET = 内容指针

        // 计算字符位置
        vm.add(VReg.V0, VReg.RET, VReg.S0);
        vm.loadByte(VReg.RET, VReg.V0, 0);
        vm.epilogue([VReg.S0], 0);
    }

    // 去除首尾空白
    // _str_trim(str) -> 新字符串
    generateTrim() {
        const vm = this.vm;
        const TYPE_STRING = 6;

        vm.label("_str_trim");
        // 使用 6 个保存寄存器: S0=str, S1=len, S2=start, S3=end/newLen后为result, S4=newLen, S5=index
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        vm.mov(VReg.S0, VReg.A0); // S0 = 源字符串

        // 计算长度
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_strlen");
        vm.mov(VReg.S1, VReg.RET); // S1 = 原始长度

        // 找到开始位置（跳过前导空白）
        vm.movImm(VReg.S2, 0); // S2 = start
        const skipStartLabel = "_trim_skip_start";
        const startDoneLabel = "_trim_start_done";
        vm.label(skipStartLabel);
        vm.cmp(VReg.S2, VReg.S1);
        vm.jge(startDoneLabel);
        vm.add(VReg.V0, VReg.S0, VReg.S2);
        vm.loadByte(VReg.V1, VReg.V0, 0);
        // 检查是否是空白字符（空格、制表符、换行）
        vm.cmpImm(VReg.V1, 32); // space
        vm.jeq("_trim_skip_inc_start");
        vm.cmpImm(VReg.V1, 9); // tab
        vm.jeq("_trim_skip_inc_start");
        vm.cmpImm(VReg.V1, 10); // newline
        vm.jeq("_trim_skip_inc_start");
        vm.cmpImm(VReg.V1, 13); // carriage return
        vm.jeq("_trim_skip_inc_start");
        vm.jmp(startDoneLabel);
        vm.label("_trim_skip_inc_start");
        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.jmp(skipStartLabel);
        vm.label(startDoneLabel);

        // 找到结束位置（跳过尾部空白）
        vm.mov(VReg.S3, VReg.S1); // S3 = end (临时用)
        const skipEndLabel = "_trim_skip_end";
        const endDoneLabel = "_trim_end_done";
        vm.label(skipEndLabel);
        vm.cmp(VReg.S3, VReg.S2);
        vm.jle(endDoneLabel);
        vm.subImm(VReg.V0, VReg.S3, 1);
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.loadByte(VReg.V1, VReg.V0, 0);
        vm.cmpImm(VReg.V1, 32);
        vm.jeq("_trim_skip_dec_end");
        vm.cmpImm(VReg.V1, 9);
        vm.jeq("_trim_skip_dec_end");
        vm.cmpImm(VReg.V1, 10);
        vm.jeq("_trim_skip_dec_end");
        vm.cmpImm(VReg.V1, 13);
        vm.jeq("_trim_skip_dec_end");
        vm.jmp(endDoneLabel);
        vm.label("_trim_skip_dec_end");
        vm.subImm(VReg.S3, VReg.S3, 1);
        vm.jmp(skipEndLabel);
        vm.label(endDoneLabel);

        // 计算新长度，保存到 S4
        vm.sub(VReg.S4, VReg.S3, VReg.S2); // S4 = newLen

        // 分配新字符串 (16 字节头 + len + 1)
        vm.addImm(VReg.A0, VReg.S4, 17);
        vm.call("_alloc");
        vm.mov(VReg.S3, VReg.RET); // S3 现在用于存储 result

        // 写入类型标记和 length
        vm.movImm(VReg.V0, TYPE_STRING);
        vm.store(VReg.S3, 0, VReg.V0);
        vm.store(VReg.S3, 8, VReg.S4);

        // 手动复制指定长度的字符
        const copyLoop = "_trim_copy";
        const copyDone = "_trim_copy_done";
        vm.movImm(VReg.S5, 0); // S5 = index
        vm.label(copyLoop);
        vm.cmp(VReg.S5, VReg.S4);
        vm.jge(copyDone);

        // 源位置 = str + start + index
        vm.add(VReg.V0, VReg.S0, VReg.S2);
        vm.add(VReg.V0, VReg.V0, VReg.S5);
        vm.loadByte(VReg.V1, VReg.V0, 0);

        // 目标位置 = result + 16 + index
        vm.addImm(VReg.V0, VReg.S3, 16);
        vm.add(VReg.V0, VReg.V0, VReg.S5);
        vm.storeByte(VReg.V0, 0, VReg.V1);

        vm.addImm(VReg.S5, VReg.S5, 1);
        vm.jmp(copyLoop);

        vm.label(copyDone);
        // 写入 null 终止符
        vm.addImm(VReg.V0, VReg.S3, 16);
        vm.add(VReg.V0, VReg.V0, VReg.S4);
        vm.movImm(VReg.V1, 0);
        vm.storeByte(VReg.V0, 0, VReg.V1);

        vm.mov(VReg.RET, VReg.S3);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 64);
    }

    // 字符串切片
    // _str_slice(str, start, end) -> 新字符串
    // end = -1 表示到末尾
    generateSlice() {
        const vm = this.vm;
        const TYPE_STRING = 6;

        vm.label("_str_slice");
        // S0=str, S1=start, S2=end/result, S3=len, S4=newLen, S5=index
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        vm.mov(VReg.S0, VReg.A0); // S0 = str
        vm.mov(VReg.S1, VReg.A1); // S1 = start
        vm.mov(VReg.S2, VReg.A2); // S2 = end (临时)

        // 计算字符串长度
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_strlen");
        vm.mov(VReg.S3, VReg.RET); // S3 = len

        // 如果 end == -1，设为 len
        // 使用寄存器比较，因为 cmpImm 不支持负数
        const endOkLabel = "_slice_end_ok";
        vm.movImm(VReg.V0, -1);
        vm.cmp(VReg.S2, VReg.V0);
        vm.jne(endOkLabel);
        vm.mov(VReg.S2, VReg.S3);
        vm.label(endOkLabel);

        // 计算新长度，保存到 S4
        vm.sub(VReg.S4, VReg.S2, VReg.S1); // S4 = newLen

        // 分配新字符串 (16 字节头 + len + 1)
        vm.addImm(VReg.A0, VReg.S4, 17);
        vm.call("_alloc");
        vm.mov(VReg.S2, VReg.RET); // S2 现在保存 result

        // 写入类型标记和 length
        vm.movImm(VReg.V0, TYPE_STRING);
        vm.store(VReg.S2, 0, VReg.V0);
        vm.store(VReg.S2, 8, VReg.S4);

        // 复制字符
        const copyLoop = "_slice_copy";
        const copyDone = "_slice_done";
        vm.movImm(VReg.S5, 0); // S5 = index
        vm.label(copyLoop);
        vm.cmp(VReg.S5, VReg.S4);
        vm.jge(copyDone);

        // 源位置 = str + start + index
        vm.add(VReg.V0, VReg.S0, VReg.S1);
        vm.add(VReg.V0, VReg.V0, VReg.S5);
        vm.loadByte(VReg.V1, VReg.V0, 0);

        // 目标位置 = result + 16 + index
        vm.addImm(VReg.V0, VReg.S2, 16);
        vm.add(VReg.V0, VReg.V0, VReg.S5);
        vm.storeByte(VReg.V0, 0, VReg.V1);

        vm.addImm(VReg.S5, VReg.S5, 1);
        vm.jmp(copyLoop);

        vm.label(copyDone);
        // 写入 null 终止符
        vm.addImm(VReg.V0, VReg.S2, 16);
        vm.add(VReg.V0, VReg.V0, VReg.S4);
        vm.movImm(VReg.V1, 0);
        vm.storeByte(VReg.V0, 0, VReg.V1);

        vm.mov(VReg.RET, VReg.S2);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 64);
    }

    // 查找子字符串
    // _str_indexOf(str, search) -> 索引或 -1
    generateIndexOf() {
        const vm = this.vm;

        vm.label("_str_indexOf");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // S0 = str
        vm.mov(VReg.S1, VReg.A1); // S1 = search

        // 调用 _strstr
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_strstr");

        // 如果返回 0，返回 -1
        const foundLabel = "_indexOf_found";
        vm.cmpImm(VReg.RET, 0);
        vm.jne(foundLabel);
        vm.movImm(VReg.RET, -1);
        vm.jmp("_indexOf_done");

        vm.label(foundLabel);
        // 计算偏移: result - str
        vm.sub(VReg.RET, VReg.RET, VReg.S0);

        vm.label("_indexOf_done");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 64);
    }

    // 生成所有字符串函数
    generate() {
        this.generateStrlen();
        this.generateStrLength(); // 统一 length 访问
        this.generateStrcmp();
        this.generateStrcpy();
        this.generateStrcat();
        this.generateGetStrContent();
        this.generateStrconcat();
        this.generateIntToStr();
        this.generateBoolToStr();
        this.generateToString();
        this.generateValueToStr(); // 智能值转字符串
        // 字符串方法
        this.generateToUpperCase();
        this.generateToLowerCase();
        this.generateCharAt();
        this.generateCharCodeAt();
        this.generateTrim();
        this.generateSlice();
        this.generateIndexOf();
    }
}
