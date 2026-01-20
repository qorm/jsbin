// JSBin 字符串运行时 - 基础操作
// 提供底层字符串操作函数

import { VReg } from "../../../vm/registers.js";

// 基础字符串操作生成器 Mixin
export const BaseStringGenerator = {
    // 生成字符串长度函数
    // _strlen(str) -> length
    // 纯 char* 格式，遍历计算长度
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
    },

    // 生成原始字符串长度函数（遍历计算，用于裸字符串指针）
    // _raw_strlen(str) -> length
    generateRawStrlen() {
        const vm = this.vm;

        vm.label("_raw_strlen");
        vm.prologue(0, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0);
        vm.movImm(VReg.S1, 0);

        const loopLabel = "_raw_strlen_loop";
        const doneLabel = "_raw_strlen_done";

        vm.label(loopLabel);
        vm.loadByte(VReg.V0, VReg.S0, 0);
        vm.cmpImm(VReg.V0, 0);
        vm.jeq(doneLabel);
        vm.addImm(VReg.S1, VReg.S1, 1);
        vm.addImm(VReg.S0, VReg.S0, 1);
        vm.jmp(loopLabel);

        vm.label(doneLabel);
        vm.mov(VReg.RET, VReg.S1);
        vm.epilogue([VReg.S0, VReg.S1], 0);
    },

    // 获取字符串长度
    // 纯 char* 格式，直接调用 _strlen
    // _str_length(str) -> length
    generateStrLength() {
        const vm = this.vm;

        vm.label("_str_length");
        // 直接调用 _strlen（纯 char* 格式）
        vm.jmp("_strlen");
    },

    // 生成字符串比较函数
    // _strcmp(s1, s2) -> 0 if equal, non-zero otherwise
    // 纯 char* 格式，无头部
    generateStrcmp() {
        const vm = this.vm;

        vm.label("_strcmp");
        vm.prologue(0, [VReg.S0, VReg.S1]);

        // 直接使用指针，无需跳过头部
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
    },

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
    },

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
    },

    // 获取字符串内容指针
    // NaN-boxing 方案：字符串指针直接指向 char* 数据，无头部
    // _getStrContent(str) -> content_ptr (直接返回输入，因为已经是 char*)
    generateGetStrContent() {
        const vm = this.vm;

        vm.label("_getStrContent");
        // 字符串已经是纯 char*，直接返回
        vm.mov(VReg.RET, VReg.A0);
        vm.ret();
    },

    // 生成字符串连接函数（分配新内存）
    // _strconcat(s1, s2) -> 新字符串（纯 char*）
    generateStrconcat() {
        const vm = this.vm;

        vm.label("_strconcat");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // S0 = s1 (char*)
        vm.mov(VReg.S1, VReg.A1); // S1 = s2 (char*)

        // 分配 256 字节（纯内容，无头部）
        vm.movImm(VReg.A0, 256);
        vm.call("_alloc");
        vm.mov(VReg.S2, VReg.RET); // S2 = 新分配的内存

        // 复制 s1 到新内存
        vm.mov(VReg.A0, VReg.S2);
        vm.mov(VReg.A1, VReg.S0);
        vm.call("_strcpy");

        // 追加 s2
        vm.mov(VReg.A0, VReg.S2);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_strcat");

        // 返回新字符串指针（纯 char*）
        vm.mov(VReg.RET, VReg.S2);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 64);
    },
};
