// JSBin 字符串运行时 - 字符串方法
// 提供 JavaScript 字符串方法的运行时实现

import { VReg } from "../../../vm/registers.js";

// 辅助函数：生成布尔返回值的结尾
// 用于 includes, startsWith, endsWith 等返回布尔值的方法
function emitBooleanReturn(vm, trueLabel, falseLabel, savedRegs, stackSize) {
    vm.label(trueLabel);
    vm.lea(VReg.RET, "_js_true");
    vm.epilogue(savedRegs, stackSize);

    vm.label(falseLabel);
    vm.lea(VReg.RET, "_js_false");
    vm.epilogue(savedRegs, stackSize);
}

// 字符串方法生成器 Mixin
export const StringMethodsGenerator = {
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
    },

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
    },

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

        // 分配 10 字节（8 字节头部 + 1 字符 + 1 null）
        vm.movImm(VReg.A0, 10);
        vm.call("_alloc");
        vm.mov(VReg.V0, VReg.RET); // V0 = 新字符串

        // 写入头部: type (低 8 位) + length (高 32 位)
        // length = 1, type = 6 (TYPE_STRING)
        // header = (1 << 32) | 6
        vm.movImm(VReg.V1, 1);
        vm.shlImm(VReg.V1, VReg.V1, 32);
        vm.movImm(VReg.V2, TYPE_STRING);
        vm.or(VReg.V1, VReg.V1, VReg.V2);
        vm.store(VReg.V0, 0, VReg.V1);

        // 获取字符 (内容指针 + index)
        vm.add(VReg.V2, VReg.S2, VReg.S1);
        vm.loadByte(VReg.V3, VReg.V2, 0);

        // 写入字符到 +8 位置（内容区域）
        vm.storeByte(VReg.V0, 8, VReg.V3);
        // 写入 null 终止符
        vm.movImm(VReg.V3, 0);
        vm.storeByte(VReg.V0, 9, VReg.V3);

        vm.mov(VReg.RET, VReg.V0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    },

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
    },

    // 查找子字符串
    // _str_indexOf(str, search) -> 索引或 -1
    generateIndexOf() {
        const vm = this.vm;

        vm.label("_str_indexOf");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        vm.mov(VReg.S0, VReg.A0); // S0 = str
        vm.mov(VReg.S1, VReg.A1); // S1 = search

        // 获取 str 长度
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_strlen");
        vm.mov(VReg.S2, VReg.RET); // S2 = str 长度

        // 获取 search 长度
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_strlen");
        vm.mov(VReg.S3, VReg.RET); // S3 = search 长度

        // 如果 search 为空，返回 0
        vm.cmpImm(VReg.S3, 0);
        vm.jne("_indexOf_nonempty");
        vm.movImm(VReg.RET, 0);
        vm.jmp("_indexOf_done");

        vm.label("_indexOf_nonempty");
        // 如果 search 比 str 长，返回 -1
        vm.cmp(VReg.S3, VReg.S2);
        vm.jle("_indexOf_search");
        vm.movImm(VReg.RET, -1);
        vm.jmp("_indexOf_done");

        vm.label("_indexOf_search");
        // 计算最大搜索位置
        vm.sub(VReg.S4, VReg.S2, VReg.S3); // S4 = str 长度 - search 长度
        vm.addImm(VReg.S4, VReg.S4, 1); // S4 = 最大起始位置 + 1

        // S5 = 当前位置
        vm.movImm(VReg.S5, 0);

        // 纯 char* 格式，直接使用指针
        vm.mov(VReg.V0, VReg.S0); // V0 = str 内容
        vm.mov(VReg.V1, VReg.S1); // V1 = search 内容

        vm.label("_indexOf_outer");
        vm.cmp(VReg.S5, VReg.S4);
        vm.jge("_indexOf_not_found");

        // 比较从 V0+S5 开始的 S3 个字符与 V1
        vm.add(VReg.V2, VReg.V0, VReg.S5); // V2 = str 当前位置
        vm.movImm(VReg.V3, 0); // V3 = 匹配索引

        vm.label("_indexOf_inner");
        vm.cmp(VReg.V3, VReg.S3);
        vm.jge("_indexOf_found");

        vm.add(VReg.V4, VReg.V2, VReg.V3);
        vm.loadByte(VReg.V5, VReg.V4, 0);
        vm.add(VReg.V4, VReg.V1, VReg.V3);
        vm.loadByte(VReg.V6, VReg.V4, 0);

        vm.cmp(VReg.V5, VReg.V6);
        vm.jne("_indexOf_next");

        vm.addImm(VReg.V3, VReg.V3, 1);
        vm.jmp("_indexOf_inner");

        vm.label("_indexOf_next");
        vm.addImm(VReg.S5, VReg.S5, 1);
        vm.jmp("_indexOf_outer");

        vm.label("_indexOf_found");
        vm.mov(VReg.RET, VReg.S5);
        vm.jmp("_indexOf_done");

        vm.label("_indexOf_not_found");
        vm.movImm(VReg.RET, -1);

        vm.label("_indexOf_done");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 64);
    },

    // _str_includes(str, search) -> boolean
    // 检查字符串是否包含子字符串
    generateIncludes() {
        const vm = this.vm;

        vm.label("_str_includes");
        vm.prologue(16, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0); // str
        vm.mov(VReg.S1, VReg.A1); // search

        // 调用 indexOf
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_str_indexOf");

        // indexOf >= 0 表示找到
        vm.cmpImm(VReg.RET, 0);
        vm.jlt("_includes_false");

        vm.lea(VReg.RET, "_js_true");
        vm.epilogue([VReg.S0, VReg.S1], 16);

        vm.label("_includes_false");
        vm.lea(VReg.RET, "_js_false");
        vm.epilogue([VReg.S0, VReg.S1], 16);
    },

    // _str_startsWith(str, search) -> boolean
    // 检查字符串是否以指定子字符串开头
    generateStartsWith() {
        const vm = this.vm;

        vm.label("_str_startsWith");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // str
        vm.mov(VReg.S1, VReg.A1); // search

        // 获取 search 长度
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_strlen");
        vm.mov(VReg.S2, VReg.RET); // S2 = search 长度

        // 获取 str 长度
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_strlen");
        vm.mov(VReg.S3, VReg.RET); // S3 = str 长度

        // 如果 search 比 str 长，返回 false
        vm.cmp(VReg.S2, VReg.S3);
        vm.jgt("_startsWith_false");

        // 比较前 S2 个字符（纯 char* 格式，无需跳过头部）
        vm.movImm(VReg.V0, 0); // index

        vm.label("_startsWith_loop");
        vm.cmp(VReg.V0, VReg.S2);
        vm.jge("_startsWith_true");

        vm.add(VReg.V1, VReg.S0, VReg.V0);
        vm.loadByte(VReg.V2, VReg.V1, 0);
        vm.add(VReg.V1, VReg.S1, VReg.V0);
        vm.loadByte(VReg.V3, VReg.V1, 0);

        vm.cmp(VReg.V2, VReg.V3);
        vm.jne("_startsWith_false");

        vm.addImm(VReg.V0, VReg.V0, 1);
        vm.jmp("_startsWith_loop");

        vm.label("_startsWith_true");
        vm.lea(VReg.RET, "_js_true");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);

        vm.label("_startsWith_false");
        vm.lea(VReg.RET, "_js_false");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
    },

    // _str_endsWith(str, search) -> boolean
    // 检查字符串是否以指定子字符串结尾
    generateEndsWith() {
        const vm = this.vm;

        vm.label("_str_endsWith");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // str
        vm.mov(VReg.S1, VReg.A1); // search

        // 获取 search 长度
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_strlen");
        vm.mov(VReg.S2, VReg.RET); // S2 = search 长度

        // 获取 str 长度
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_strlen");
        vm.mov(VReg.S3, VReg.RET); // S3 = str 长度

        // 如果 search 比 str 长，返回 false
        vm.cmp(VReg.S2, VReg.S3);
        vm.jgt("_endsWith_false");

        // 计算起始位置: str 长度 - search 长度
        vm.sub(VReg.S4, VReg.S3, VReg.S2); // S4 = offset

        // 比较后 S2 个字符（纯 char* 格式，无需跳过头部）
        vm.add(VReg.S0, VReg.S0, VReg.S4); // 从 offset 开始
        vm.movImm(VReg.V0, 0); // index

        vm.label("_endsWith_loop");
        vm.cmp(VReg.V0, VReg.S2);
        vm.jge("_endsWith_true");

        vm.add(VReg.V1, VReg.S0, VReg.V0);
        vm.loadByte(VReg.V2, VReg.V1, 0);
        vm.add(VReg.V1, VReg.S1, VReg.V0);
        vm.loadByte(VReg.V3, VReg.V1, 0);

        vm.cmp(VReg.V2, VReg.V3);
        vm.jne("_endsWith_false");

        vm.addImm(VReg.V0, VReg.V0, 1);
        vm.jmp("_endsWith_loop");

        vm.label("_endsWith_true");
        vm.lea(VReg.RET, "_js_true");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 32);

        vm.label("_endsWith_false");
        vm.lea(VReg.RET, "_js_false");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 32);
    },

    // _str_lastIndexOf(str, search) -> 最后出现的索引或 -1
    generateLastIndexOf() {
        const vm = this.vm;

        vm.label("_str_lastIndexOf");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        vm.mov(VReg.S0, VReg.A0); // str
        vm.mov(VReg.S1, VReg.A1); // search

        // 获取 str 长度
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_strlen");
        vm.mov(VReg.S2, VReg.RET); // S2 = str 长度

        // 获取 search 长度
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_strlen");
        vm.mov(VReg.S3, VReg.RET); // S3 = search 长度

        // 如果 search 为空，返回 str 长度
        vm.cmpImm(VReg.S3, 0);
        vm.jne("_lastIndexOf_nonempty");
        vm.mov(VReg.RET, VReg.S2);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 48);

        vm.label("_lastIndexOf_nonempty");
        // 如果 search 比 str 长，返回 -1
        vm.cmp(VReg.S3, VReg.S2);
        vm.jle("_lastIndexOf_search");
        vm.movImm(VReg.RET, -1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 48);

        vm.label("_lastIndexOf_search");
        // 从后往前搜索
        vm.sub(VReg.S4, VReg.S2, VReg.S3); // S4 = 最大起始位置
        vm.movImm(VReg.S5, -1); // S5 = 结果（初始化为 -1）

        // 纯 char* 格式，直接使用指针
        vm.mov(VReg.V0, VReg.S0); // str 内容
        vm.mov(VReg.V1, VReg.S1); // search 内容

        vm.label("_lastIndexOf_loop");
        vm.cmpImm(VReg.S4, 0);
        vm.jlt("_lastIndexOf_done");

        // 比较 str[S4:S4+S3] 与 search
        vm.add(VReg.V2, VReg.V0, VReg.S4); // str + offset
        vm.movImm(VReg.V3, 0); // match index

        vm.label("_lastIndexOf_match");
        vm.cmp(VReg.V3, VReg.S3);
        vm.jge("_lastIndexOf_found");

        vm.add(VReg.V4, VReg.V2, VReg.V3);
        vm.loadByte(VReg.V5, VReg.V4, 0);
        vm.add(VReg.V4, VReg.V1, VReg.V3);
        vm.loadByte(VReg.V6, VReg.V4, 0);

        vm.cmp(VReg.V5, VReg.V6);
        vm.jne("_lastIndexOf_next");

        vm.addImm(VReg.V3, VReg.V3, 1);
        vm.jmp("_lastIndexOf_match");

        vm.label("_lastIndexOf_found");
        vm.mov(VReg.S5, VReg.S4);
        vm.jmp("_lastIndexOf_done");

        vm.label("_lastIndexOf_next");
        vm.subImm(VReg.S4, VReg.S4, 1);
        vm.jmp("_lastIndexOf_loop");

        vm.label("_lastIndexOf_done");
        vm.mov(VReg.RET, VReg.S5);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 48);
    },

    // _str_repeat(str, count) -> 重复的新字符串
    generateRepeat() {
        const vm = this.vm;

        vm.label("_str_repeat");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        vm.mov(VReg.S0, VReg.A0); // str
        vm.mov(VReg.S1, VReg.A1); // count

        // 如果 count <= 0，返回空字符串
        vm.cmpImm(VReg.S1, 0);
        vm.jgt("_repeat_nonzero");
        vm.lea(VReg.RET, "_str_empty");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 48);

        vm.label("_repeat_nonzero");
        // 获取字符串长度
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_strlen");
        vm.mov(VReg.S2, VReg.RET); // S2 = 单个长度

        // 计算总长度
        vm.mul(VReg.S3, VReg.S2, VReg.S1); // S3 = 总长度

        // 分配新字符串（纯 char*，无头部）
        vm.mov(VReg.A0, VReg.S3);
        vm.addImm(VReg.A0, VReg.A0, 1); // +1 null terminator
        vm.call("_alloc");
        vm.mov(VReg.S4, VReg.RET); // S4 = 新字符串

        // 复制 count 次（纯 char* 格式）
        vm.mov(VReg.V1, VReg.S0); // 源
        vm.mov(VReg.S5, VReg.S4); // 目标
        vm.movImm(VReg.V2, 0); // repeat index

        vm.label("_repeat_outer");
        vm.cmp(VReg.V2, VReg.S1);
        vm.jge("_repeat_done");

        vm.movImm(VReg.V3, 0); // char index
        vm.label("_repeat_inner");
        vm.cmp(VReg.V3, VReg.S2);
        vm.jge("_repeat_next");
        vm.add(VReg.V4, VReg.V1, VReg.V3);
        vm.loadByte(VReg.V5, VReg.V4, 0);
        vm.storeByte(VReg.S5, 0, VReg.V5);
        vm.addImm(VReg.S5, VReg.S5, 1);
        vm.addImm(VReg.V3, VReg.V3, 1);
        vm.jmp("_repeat_inner");

        vm.label("_repeat_next");
        vm.addImm(VReg.V2, VReg.V2, 1);
        vm.jmp("_repeat_outer");

        vm.label("_repeat_done");
        // null terminator
        vm.movImm(VReg.V0, 0);
        vm.storeByte(VReg.S5, 0, VReg.V0);

        vm.mov(VReg.RET, VReg.S4);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 48);
    },

    // _str_at(str, index) -> 单字符字符串或 undefined
    generateAt() {
        const vm = this.vm;

        vm.label("_str_at");
        vm.prologue(16, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // str
        vm.mov(VReg.S1, VReg.A1); // index

        // 获取长度
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_strlen");
        vm.mov(VReg.S2, VReg.RET);

        // 处理负数索引
        vm.cmpImm(VReg.S1, 0);
        vm.jge("_at_positive");
        vm.add(VReg.S1, VReg.S1, VReg.S2);

        vm.label("_at_positive");
        // 边界检查
        vm.cmpImm(VReg.S1, 0);
        vm.jlt("_at_undefined");
        vm.cmp(VReg.S1, VReg.S2);
        vm.jge("_at_undefined");

        // 调用 charAt
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_str_charAt");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 16);

        vm.label("_at_undefined");
        vm.lea(VReg.RET, "_js_undefined");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 16);
    },

    // _str_concat(str1, str2) -> 连接后的新字符串
    // 注意：这与 _strconcat 不同，_strconcat 处理任意值
    generateConcat() {
        const vm = this.vm;

        vm.label("_str_concat");
        // 直接调用 _strconcat
        vm.jmp("_strconcat");
    },
};
