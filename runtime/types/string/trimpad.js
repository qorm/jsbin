// JSBin 字符串运行时 - Trim 和 Pad 方法
// 提供 trim, slice, substring, pad 等方法

import { VReg } from "../../../vm/registers.js";

// Trim/Pad 方法生成器 Mixin
export const StringTrimPadGenerator = {
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
    },

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
    },

    // _str_substring(str, start, end) -> 新字符串
    // 提取子字符串（与 slice 类似但不支持负数索引）
    generateSubstring() {
        const vm = this.vm;

        vm.label("_str_substring");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        vm.mov(VReg.S0, VReg.A0); // str
        vm.mov(VReg.S1, VReg.A1); // start
        vm.mov(VReg.S2, VReg.A2); // end

        // 获取字符串长度
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_strlen");
        vm.mov(VReg.S3, VReg.RET); // S3 = len

        // 规范化 start: max(0, min(start, len))
        vm.cmpImm(VReg.S1, 0);
        vm.jge("_substring_start_ok");
        vm.movImm(VReg.S1, 0);
        vm.label("_substring_start_ok");
        vm.cmp(VReg.S1, VReg.S3);
        vm.jle("_substring_start_ok2");
        vm.mov(VReg.S1, VReg.S3);
        vm.label("_substring_start_ok2");

        // 规范化 end: max(0, min(end, len))
        vm.cmpImm(VReg.S2, 0);
        vm.jge("_substring_end_ok");
        vm.movImm(VReg.S2, 0);
        vm.label("_substring_end_ok");
        vm.cmp(VReg.S2, VReg.S3);
        vm.jle("_substring_end_ok2");
        vm.mov(VReg.S2, VReg.S3);
        vm.label("_substring_end_ok2");

        // 如果 start > end，交换它们
        vm.cmp(VReg.S1, VReg.S2);
        vm.jle("_substring_no_swap");
        vm.mov(VReg.V0, VReg.S1);
        vm.mov(VReg.S1, VReg.S2);
        vm.mov(VReg.S2, VReg.V0);
        vm.label("_substring_no_swap");

        // 计算结果长度
        vm.sub(VReg.S4, VReg.S2, VReg.S1); // S4 = end - start

        // 分配新字符串（纯 char*，无头部）
        vm.mov(VReg.A0, VReg.S4);
        vm.addImm(VReg.A0, VReg.A0, 1); // +1 null terminator
        vm.call("_alloc");
        vm.mov(VReg.S5, VReg.RET); // S5 = 新字符串

        // 复制字符（纯 char* 格式）
        vm.add(VReg.V1, VReg.S0, VReg.S1); // 源 = str + start
        vm.mov(VReg.V2, VReg.S5); // 目标 = 新字符串起始
        vm.movImm(VReg.V3, 0); // index

        vm.label("_substring_copy");
        vm.cmp(VReg.V3, VReg.S4);
        vm.jge("_substring_done");
        vm.add(VReg.V4, VReg.V1, VReg.V3);
        vm.loadByte(VReg.V5, VReg.V4, 0);
        vm.add(VReg.V4, VReg.V2, VReg.V3);
        vm.storeByte(VReg.V4, 0, VReg.V5);
        vm.addImm(VReg.V3, VReg.V3, 1);
        vm.jmp("_substring_copy");

        vm.label("_substring_done");
        // 添加 null terminator
        vm.add(VReg.V4, VReg.V2, VReg.S4);
        vm.movImm(VReg.V5, 0);
        vm.storeByte(VReg.V4, 0, VReg.V5);

        vm.mov(VReg.RET, VReg.S5);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 48);
    },

    // _str_padStart(str, targetLen, padStr) -> 填充后的新字符串
    generatePadStart() {
        const vm = this.vm;

        vm.label("_str_padStart");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        vm.mov(VReg.S0, VReg.A0); // str
        vm.mov(VReg.S1, VReg.A1); // targetLen
        vm.mov(VReg.S2, VReg.A2); // padStr

        // 获取 str 长度
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_strlen");
        vm.mov(VReg.S3, VReg.RET); // S3 = str 长度

        // 如果 str 长度 >= targetLen，返回原字符串
        vm.cmp(VReg.S3, VReg.S1);
        vm.jlt("_padStart_pad");
        vm.mov(VReg.RET, VReg.S0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 64);

        vm.label("_padStart_pad");
        // 获取 padStr 长度
        vm.mov(VReg.A0, VReg.S2);
        vm.call("_strlen");
        vm.mov(VReg.S4, VReg.RET); // S4 = padStr 长度

        // 如果 padStr 为空，使用空格（简化：直接返回原字符串）
        vm.cmpImm(VReg.S4, 0);
        vm.jne("_padStart_haspad");
        vm.mov(VReg.RET, VReg.S0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 64);

        vm.label("_padStart_haspad");
        // 计算需要填充的长度
        vm.sub(VReg.S5, VReg.S1, VReg.S3); // S5 = padLen

        // 分配新字符串（纯 char*，无头部）
        vm.mov(VReg.A0, VReg.S1);
        vm.addImm(VReg.A0, VReg.A0, 1); // +1 null terminator
        vm.call("_alloc");
        vm.store(VReg.FP, -8, VReg.RET); // 保存新字符串

        // 填充 padStr（纯 char* 格式）
        vm.load(VReg.V2, VReg.FP, -8);
        vm.mov(VReg.V3, VReg.S2); // padStr 内容
        vm.movImm(VReg.V4, 0); // 已填充字符数
        vm.movImm(VReg.V5, 0); // padStr 索引

        vm.label("_padStart_fill");
        vm.cmp(VReg.V4, VReg.S5);
        vm.jge("_padStart_copy");
        vm.add(VReg.V6, VReg.V3, VReg.V5);
        vm.loadByte(VReg.V7, VReg.V6, 0);
        vm.storeByte(VReg.V2, 0, VReg.V7);
        vm.addImm(VReg.V2, VReg.V2, 1);
        vm.addImm(VReg.V4, VReg.V4, 1);
        vm.addImm(VReg.V5, VReg.V5, 1);
        // 循环 padStr
        vm.cmp(VReg.V5, VReg.S4);
        vm.jlt("_padStart_fill");
        vm.movImm(VReg.V5, 0);
        vm.jmp("_padStart_fill");

        vm.label("_padStart_copy");
        // 复制原字符串（纯 char* 格式）
        vm.mov(VReg.V3, VReg.S0);
        vm.movImm(VReg.V4, 0);

        vm.label("_padStart_copy_loop");
        vm.cmp(VReg.V4, VReg.S3);
        vm.jge("_padStart_done");
        vm.add(VReg.V5, VReg.V3, VReg.V4);
        vm.loadByte(VReg.V6, VReg.V5, 0);
        vm.storeByte(VReg.V2, 0, VReg.V6);
        vm.addImm(VReg.V2, VReg.V2, 1);
        vm.addImm(VReg.V4, VReg.V4, 1);
        vm.jmp("_padStart_copy_loop");

        vm.label("_padStart_done");
        vm.movImm(VReg.V0, 0);
        vm.storeByte(VReg.V2, 0, VReg.V0);
        vm.load(VReg.RET, VReg.FP, -8);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 64);
    },

    // _str_padEnd(str, targetLen, padStr) -> 填充后的新字符串
    generatePadEnd() {
        const vm = this.vm;

        vm.label("_str_padEnd");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        vm.mov(VReg.S0, VReg.A0); // str
        vm.mov(VReg.S1, VReg.A1); // targetLen
        vm.mov(VReg.S2, VReg.A2); // padStr

        // 获取 str 长度
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_strlen");
        vm.mov(VReg.S3, VReg.RET);

        // 如果 str 长度 >= targetLen，返回原字符串
        vm.cmp(VReg.S3, VReg.S1);
        vm.jlt("_padEnd_pad");
        vm.mov(VReg.RET, VReg.S0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 64);

        vm.label("_padEnd_pad");
        // 获取 padStr 长度
        vm.mov(VReg.A0, VReg.S2);
        vm.call("_strlen");
        vm.mov(VReg.S4, VReg.RET);

        vm.cmpImm(VReg.S4, 0);
        vm.jne("_padEnd_haspad");
        vm.mov(VReg.RET, VReg.S0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 64);

        vm.label("_padEnd_haspad");
        vm.sub(VReg.S5, VReg.S1, VReg.S3); // padLen

        // 分配新字符串（纯 char*，无头部）
        vm.mov(VReg.A0, VReg.S1);
        vm.addImm(VReg.A0, VReg.A0, 1); // +1 null terminator
        vm.call("_alloc");
        vm.store(VReg.FP, -8, VReg.RET);

        // 先复制原字符串（纯 char* 格式）
        vm.load(VReg.V2, VReg.FP, -8);
        vm.mov(VReg.V3, VReg.S0);
        vm.movImm(VReg.V4, 0);

        vm.label("_padEnd_copy");
        vm.cmp(VReg.V4, VReg.S3);
        vm.jge("_padEnd_fill");
        vm.add(VReg.V5, VReg.V3, VReg.V4);
        vm.loadByte(VReg.V6, VReg.V5, 0);
        vm.storeByte(VReg.V2, 0, VReg.V6);
        vm.addImm(VReg.V2, VReg.V2, 1);
        vm.addImm(VReg.V4, VReg.V4, 1);
        vm.jmp("_padEnd_copy");

        vm.label("_padEnd_fill");
        // 填充 padStr（纯 char* 格式）
        vm.mov(VReg.V3, VReg.S2);
        vm.movImm(VReg.V4, 0);
        vm.movImm(VReg.V5, 0);

        vm.label("_padEnd_fill_loop");
        vm.cmp(VReg.V4, VReg.S5);
        vm.jge("_padEnd_done");
        vm.add(VReg.V6, VReg.V3, VReg.V5);
        vm.loadByte(VReg.V7, VReg.V6, 0);
        vm.storeByte(VReg.V2, 0, VReg.V7);
        vm.addImm(VReg.V2, VReg.V2, 1);
        vm.addImm(VReg.V4, VReg.V4, 1);
        vm.addImm(VReg.V5, VReg.V5, 1);
        vm.cmp(VReg.V5, VReg.S4);
        vm.jlt("_padEnd_fill_loop");
        vm.movImm(VReg.V5, 0);
        vm.jmp("_padEnd_fill_loop");

        vm.label("_padEnd_done");
        vm.movImm(VReg.V0, 0);
        vm.storeByte(VReg.V2, 0, VReg.V0);
        vm.load(VReg.RET, VReg.FP, -8);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 64);
    },

    // _str_trimStart(str) -> 去除开头空白的新字符串
    generateTrimStart() {
        const vm = this.vm;

        vm.label("_str_trimStart");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0);

        // 获取长度
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_strlen");
        vm.mov(VReg.S1, VReg.RET);

        // 找到第一个非空白字符（纯 char* 格式）
        vm.mov(VReg.S2, VReg.S0);
        vm.movImm(VReg.S3, 0); // start index

        vm.label("_trimStart_loop");
        vm.cmp(VReg.S3, VReg.S1);
        vm.jge("_trimStart_empty");
        vm.add(VReg.V0, VReg.S2, VReg.S3);
        vm.loadByte(VReg.V1, VReg.V0, 0);
        // 检查是否是空白字符 (空格, \t, \n, \r)
        vm.cmpImm(VReg.V1, 32); // 空格
        vm.jeq("_trimStart_next");
        vm.cmpImm(VReg.V1, 9); // \t
        vm.jeq("_trimStart_next");
        vm.cmpImm(VReg.V1, 10); // \n
        vm.jeq("_trimStart_next");
        vm.cmpImm(VReg.V1, 13); // \r
        vm.jeq("_trimStart_next");
        vm.jmp("_trimStart_found");

        vm.label("_trimStart_next");
        vm.addImm(VReg.S3, VReg.S3, 1);
        vm.jmp("_trimStart_loop");

        vm.label("_trimStart_empty");
        vm.lea(VReg.RET, "_str_empty");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);

        vm.label("_trimStart_found");
        // 调用 slice(start, len)
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A1, VReg.S3);
        vm.mov(VReg.A2, VReg.S1);
        vm.call("_str_slice");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
    },

    // _str_trimEnd(str) -> 去除结尾空白的新字符串
    generateTrimEnd() {
        const vm = this.vm;

        vm.label("_str_trimEnd");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0);

        // 获取长度
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_strlen");
        vm.mov(VReg.S1, VReg.RET);

        // 如果为空，返回空字符串
        vm.cmpImm(VReg.S1, 0);
        vm.jne("_trimEnd_nonempty");
        vm.lea(VReg.RET, "_str_empty");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);

        vm.label("_trimEnd_nonempty");
        // 从后往前找第一个非空白字符（纯 char* 格式）
        vm.mov(VReg.S2, VReg.S0);
        vm.mov(VReg.S3, VReg.S1); // end index

        vm.label("_trimEnd_loop");
        vm.cmpImm(VReg.S3, 0);
        vm.jle("_trimEnd_empty");
        vm.subImm(VReg.V0, VReg.S3, 1);
        vm.add(VReg.V0, VReg.S2, VReg.V0);
        vm.loadByte(VReg.V1, VReg.V0, 0);
        vm.cmpImm(VReg.V1, 32);
        vm.jeq("_trimEnd_next");
        vm.cmpImm(VReg.V1, 9);
        vm.jeq("_trimEnd_next");
        vm.cmpImm(VReg.V1, 10);
        vm.jeq("_trimEnd_next");
        vm.cmpImm(VReg.V1, 13);
        vm.jeq("_trimEnd_next");
        vm.jmp("_trimEnd_found");

        vm.label("_trimEnd_next");
        vm.subImm(VReg.S3, VReg.S3, 1);
        vm.jmp("_trimEnd_loop");

        vm.label("_trimEnd_empty");
        vm.lea(VReg.RET, "_str_empty");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);

        vm.label("_trimEnd_found");
        // 调用 slice(0, end)
        vm.mov(VReg.A0, VReg.S0);
        vm.movImm(VReg.A1, 0);
        vm.mov(VReg.A2, VReg.S3);
        vm.call("_str_slice");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
    },

    // _str_split(str, separator) -> 数组
    generateSplit() {
        const vm = this.vm;

        vm.label("_str_split");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        vm.mov(VReg.S0, VReg.A0); // str
        vm.mov(VReg.S1, VReg.A1); // separator

        // 获取 str 长度
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_strlen");
        vm.mov(VReg.S2, VReg.RET);

        // 获取 separator 长度
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_strlen");
        vm.mov(VReg.S3, VReg.RET);

        // 分配数组（初始容量 8）
        vm.movImm(VReg.A0, 8);
        vm.call("_array_new_with_size");
        vm.mov(VReg.S4, VReg.RET); // S4 = result array

        // 如果 separator 为空，每个字符一个元素
        vm.cmpImm(VReg.S3, 0);
        vm.jne("_split_nonempty_sep");

        // 空 separator: 分割每个字符
        vm.movImm(VReg.S5, 0);
        vm.label("_split_char_loop");
        vm.cmp(VReg.S5, VReg.S2);
        vm.jge("_split_done");

        // 创建单字符字符串
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A1, VReg.S5);
        vm.call("_str_charAt");

        // push 到数组
        vm.mov(VReg.A0, VReg.S4);
        vm.mov(VReg.A1, VReg.RET);
        vm.call("_array_push");

        vm.addImm(VReg.S5, VReg.S5, 1);
        vm.jmp("_split_char_loop");

        vm.label("_split_nonempty_sep");
        // 非空 separator 分割
        vm.movImm(VReg.S5, 0); // 上一个匹配结束位置
        vm.store(VReg.FP, -8, VReg.S5); // 保存

        // 纯 char* 格式，直接使用指针
        vm.mov(VReg.V0, VReg.S0); // str 内容
        vm.mov(VReg.V1, VReg.S1); // separator 内容

        vm.label("_split_search");
        vm.load(VReg.S5, VReg.FP, -8);
        // 计算剩余长度
        vm.sub(VReg.V2, VReg.S2, VReg.S5);
        vm.cmp(VReg.V2, VReg.S3);
        vm.jlt("_split_last");

        // 在位置 S5 开始搜索 separator
        vm.add(VReg.V3, VReg.V0, VReg.S5); // 当前位置
        vm.movImm(VReg.V4, 0); // match index

        vm.label("_split_match");
        vm.cmp(VReg.V4, VReg.S3);
        vm.jge("_split_found");
        vm.add(VReg.V5, VReg.V3, VReg.V4);
        vm.loadByte(VReg.V6, VReg.V5, 0);
        vm.add(VReg.V5, VReg.V1, VReg.V4);
        vm.loadByte(VReg.V7, VReg.V5, 0);
        vm.cmp(VReg.V6, VReg.V7);
        vm.jne("_split_next_pos");
        vm.addImm(VReg.V4, VReg.V4, 1);
        vm.jmp("_split_match");

        vm.label("_split_found");
        // 找到匹配，提取子字符串
        vm.load(VReg.V2, VReg.FP, -8); // 起始位置
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A1, VReg.V2);
        vm.mov(VReg.A2, VReg.S5);
        vm.call("_str_slice");

        // push 到数组
        vm.mov(VReg.A0, VReg.S4);
        vm.mov(VReg.A1, VReg.RET);
        vm.call("_array_push");

        // 更新起始位置
        vm.load(VReg.S5, VReg.FP, -8);
        vm.sub(VReg.S5, VReg.S5, VReg.S5); // 清零以便重新计算
        // 这里逻辑有问题，需要重新设计
        // 简化：跳到下一个位置
        vm.load(VReg.V2, VReg.FP, -8);
        vm.add(VReg.V2, VReg.S5, VReg.S3); // 跳过 separator
        vm.store(VReg.FP, -8, VReg.V2);
        vm.jmp("_split_search");

        vm.label("_split_next_pos");
        vm.addImm(VReg.S5, VReg.S5, 1);
        vm.store(VReg.FP, -8, VReg.S5);
        vm.jmp("_split_search");

        vm.label("_split_last");
        // 添加最后一部分
        vm.load(VReg.V2, VReg.FP, -8);
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A1, VReg.V2);
        vm.mov(VReg.A2, VReg.S2);
        vm.call("_str_slice");

        vm.mov(VReg.A0, VReg.S4);
        vm.mov(VReg.A1, VReg.RET);
        vm.call("_array_push");

        vm.label("_split_done");
        vm.mov(VReg.RET, VReg.S4);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 64);
    },
};
