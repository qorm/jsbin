// JSBin 运行时 - Date 支持
// 实现 JavaScript Date 对象的基本功能

import { VReg } from "../../../vm/index.js";
import { TYPE_STRING } from "../../core/allocator.js";

// Date 对象内存布局:
// +0:  type (8 bytes) = TYPE_DATE (7)
// +8:  timestamp (8 bytes) - 毫秒时间戳

const TYPE_DATE = 7;
const DATE_SIZE = 16;

export class DateGenerator {
    constructor(vm) {
        this.vm = vm;
    }

    generate() {
        const vm = this.vm;
        const platform = vm.platform;
        const arch = vm.arch;

        // Date.now() - 获取当前时间戳（毫秒）
        vm.label("_date_now");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        if (arch === "arm64" && platform === "macos") {
            // macOS ARM64: 使用 gettimeofday 系统调用
            // SP 指向 prologue 分配的 64 字节空间的底部
            // 我们使用 SP+0 到 SP+15 作为 timeval 缓冲区
            vm.mov(VReg.A0, VReg.SP); // A0 = SP (timeval buffer)
            vm.movImm(VReg.A1, 0); // A1 = NULL (timezone)
            vm.syscall(116); // gettimeofday

            // 系统调用后，检查返回值 (在 X0/A0/RET 中)
            // gettimeofday 成功返回 0，失败返回 -1

            // 读取 tv_sec (8 bytes at SP+0)
            vm.load(VReg.S0, VReg.SP, 0); // tv_sec (整数)
            // 读取 tv_usec (4 bytes at SP+8)
            vm.load(VReg.S1, VReg.SP, 8); // tv_usec (整数)

            // 转换为毫秒（整数运算避免精度损失）
            // ms = sec * 1000 + usec / 1000
            vm.movImm(VReg.V1, 1000);
            vm.mul(VReg.S0, VReg.S0, VReg.V1); // S0 = sec * 1000
            vm.div(VReg.S1, VReg.S1, VReg.V1); // S1 = usec / 1000
            vm.add(VReg.S0, VReg.S0, VReg.S1); // S0 = 总毫秒数

            // 转换为 IEEE 754 浮点数位模式
            vm.scvtf(0, VReg.S0); // D0 = (double)ms
            vm.fmovToInt(VReg.RET, 0); // X0 = D0 的位模式
        } else if (arch === "arm64" && platform === "linux") {
            // Linux ARM64: 使用 clock_gettime
            vm.movImm(VReg.A0, 0); // CLOCK_REALTIME
            vm.mov(VReg.A1, VReg.SP); // timespec 指针
            vm.syscall(228); // clock_gettime (arm64 linux)

            vm.load(VReg.S0, VReg.SP, 0); // tv_sec
            vm.load(VReg.S1, VReg.SP, 8); // tv_nsec

            // 转换为毫秒（整数运算避免精度损失）
            // ms = sec * 1000 + nsec / 1000000
            vm.movImm(VReg.V1, 1000);
            vm.mul(VReg.S0, VReg.S0, VReg.V1); // S0 = sec * 1000
            vm.movImm(VReg.V1, 1000000);
            vm.div(VReg.S1, VReg.S1, VReg.V1); // S1 = nsec / 1000000
            vm.add(VReg.S0, VReg.S0, VReg.S1); // S0 = 总毫秒数

            // 转换为 IEEE 754 浮点数位模式
            vm.scvtf(0, VReg.S0); // D0 = (double)ms
            vm.fmovToInt(VReg.RET, 0);
        } else if (arch === "x64" && platform === "macos") {
            // macOS x64: 使用 gettimeofday (syscall 116 + 0x2000000)
            vm.mov(VReg.A0, VReg.SP);
            vm.movImm(VReg.A1, 0);
            vm.syscall(0x2000074); // gettimeofday (macOS x64)

            vm.load(VReg.S0, VReg.SP, 0); // tv_sec
            vm.load(VReg.S1, VReg.SP, 8); // tv_usec

            // 转换为毫秒（整数运算避免精度损失）
            vm.movImm(VReg.V1, 1000);
            vm.mul(VReg.S0, VReg.S0, VReg.V1); // S0 = sec * 1000
            vm.div(VReg.S1, VReg.S1, VReg.V1); // S1 = usec / 1000
            vm.add(VReg.S0, VReg.S0, VReg.S1); // S0 = 总毫秒数

            // 转换为 IEEE 754 浮点数位模式
            vm.scvtf(0, VReg.S0); // XMM0 = (double)ms
            vm.fmovToInt(VReg.RET, 0); // RAX = XMM0 的位模式
        } else if (arch === "x64" && platform === "linux") {
            // Linux x64: 使用 gettimeofday
            vm.mov(VReg.A0, VReg.SP);
            vm.movImm(VReg.A1, 0);
            vm.syscall(96); // gettimeofday (linux x64)

            vm.load(VReg.S0, VReg.SP, 0); // tv_sec
            vm.load(VReg.S1, VReg.SP, 8); // tv_usec

            // 转换为毫秒（整数运算避免精度损失）
            vm.movImm(VReg.V1, 1000);
            vm.mul(VReg.S0, VReg.S0, VReg.V1); // S0 = sec * 1000
            vm.div(VReg.S1, VReg.S1, VReg.V1); // S1 = usec / 1000
            vm.add(VReg.S0, VReg.S0, VReg.S1); // S0 = 总毫秒数

            // 转换为 IEEE 754 浮点数位模式
            vm.scvtf(0, VReg.S0); // XMM0 = (double)ms
            vm.fmovToInt(VReg.RET, 0); // RAX = XMM0 的位模式
        } else if (arch === "x64" && platform === "windows") {
            // Windows x64: 使用 GetSystemTimeAsFileTime
            // FILETIME 是 100 纳秒为单位，从 1601-01-01 开始
            // 需要转换为从 1970-01-01 的毫秒数

            // GetSystemTimeAsFileTime 参数: RCX = FILETIME 指针
            vm.mov(VReg.A0, VReg.SP); // RCX = SP (FILETIME buffer, 8 bytes)
            vm.callIAT("GetSystemTimeAsFileTime");

            // 读取 FILETIME (64位值，存储在 SP+0)
            vm.load(VReg.S0, VReg.SP, 0); // 整个 64 位 FILETIME

            // 转换 FILETIME 到 Unix 时间戳（毫秒）
            // FILETIME epoch: 1601-01-01
            // Unix epoch: 1970-01-01
            // 差值: 116444736000000000 (100纳秒单位)

            // 加载 epoch 差值到 S1
            // 116444736000000000 = 0x019DB1DED53E8000
            vm.movImm(VReg.S1, 0x019db1de);
            vm.shlImm(VReg.S1, VReg.S1, 32);
            vm.movImm(VReg.V1, 0xd53e8000);
            vm.or(VReg.S1, VReg.S1, VReg.V1);

            // S0 = FILETIME - epoch_diff
            vm.sub(VReg.S0, VReg.S0, VReg.S1);

            // 转换为毫秒: S0 / 10000 (整数除法)
            vm.movImm(VReg.V1, 10000);
            vm.div(VReg.S0, VReg.S0, VReg.V1); // S0 = 毫秒

            // 转换为 IEEE 754 浮点数位模式
            vm.scvtf(0, VReg.S0); // XMM0 = (double)ms

            vm.fmovToInt(VReg.RET, 0); // RAX = XMM0 的位模式
        } else {
            // 其他平台：返回 0
            vm.movImm(VReg.RET, 0);
        }

        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 64);

        // _date_new - 创建新的 Date 对象
        // A0 = 时间戳（可选，0 表示使用当前时间）
        vm.label("_date_new");
        vm.prologue(16, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0); // 保存时间戳参数

        // 如果时间戳为 0，获取当前时间
        vm.cmpImm(VReg.S0, 0);
        const hasTimestampLabel = "_date_new_has_ts";
        vm.jne(hasTimestampLabel);
        vm.call("_date_now");
        vm.mov(VReg.S0, VReg.RET);
        vm.label(hasTimestampLabel);

        // 分配 Date 对象
        vm.movImm(VReg.A0, DATE_SIZE);
        vm.call("_alloc");

        // 设置类型和时间戳
        vm.movImm(VReg.V1, TYPE_DATE);
        vm.store(VReg.RET, 0, VReg.V1); // type
        vm.store(VReg.RET, 8, VReg.S0); // timestamp

        vm.epilogue([VReg.S0], 16);

        // _date_new_from_string - 从 ISO 字符串创建 Date 对象
        // A0 = 字符串指针 (指向字符内容，如 "2026-01-14T08:03:47.577Z")
        vm.label("_date_new_from_string");
        vm.prologue(16, [VReg.S0]);
        vm.mov(VReg.S0, VReg.A0); // 保存字符串指针

        // 解析 ISO 字符串为时间戳
        vm.call("_date_parse_iso");
        vm.mov(VReg.S0, VReg.RET); // S0 = 时间戳

        // 分配 Date 对象
        vm.movImm(VReg.A0, DATE_SIZE);
        vm.call("_alloc");

        // 设置类型和时间戳
        vm.movImm(VReg.V1, TYPE_DATE);
        vm.store(VReg.RET, 0, VReg.V1); // type
        vm.store(VReg.RET, 8, VReg.S0); // timestamp

        vm.epilogue([VReg.S0], 16);

        // _date_getTime - 获取 Date 对象的时间戳
        // A0 = Date 对象指针
        vm.label("_date_getTime");
        vm.load(VReg.RET, VReg.A0, 8);
        vm.ret();

        // _date_toString - 返回日期字符串
        // A0 = Date 对象指针
        // 返回: 字符串指针（与 toISOString 相同格式）
        vm.label("_date_toString");
        // 直接调用 toISOString 返回格式化字符串
        vm.jmp("_date_toISOString");

        // 生成 toISOString 相关辅助函数
        this.generateToISOString();
    }

    // 生成 _date_toISOString 函数
    // 返回格式: YYYY-MM-DDTHH:mm:ss.sssZ (24 字符)
    generateToISOString() {
        const vm = this.vm;

        // _date_toISOString
        // A0 = Date 对象指针
        // 返回: 字符串指针
        vm.label("_date_toISOString");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        // 从 Date 对象加载时间戳（IEEE 754 位模式）
        vm.load(VReg.S0, VReg.A0, 8); // S0 = timestamp 位模式

        // 使用浮点运算分解时间戳，避免大整数问题
        // D0 = timestamp (毫秒)
        vm.fmovToFloat(0, VReg.S0); // D0/XMM0 = timestamp

        // 毫秒 = timestamp % 1000
        // D1 = 1000.0
        vm.movImm(VReg.V0, 1000);
        vm.scvtf(1, VReg.V0); // D1 = 1000.0
        vm.fdiv(2, 0, 1); // D2 = timestamp / 1000
        vm.ftrunc(2, 2); // D2 = trunc(D2) = 秒数
        vm.fmul(3, 2, 1); // D3 = 秒数 * 1000
        vm.fsub(4, 0, 3); // D4 = timestamp - D3 = 毫秒
        vm.fcvtzs(VReg.S1, 4); // S1 = 毫秒 (整数)

        // D2 现在是总秒数，继续分解
        // 秒 = 秒数 % 60
        vm.movImm(VReg.V0, 60);
        vm.scvtf(1, VReg.V0); // D1 = 60.0
        vm.fdiv(3, 2, 1); // D3 = 秒数 / 60
        vm.ftrunc(3, 3); // D3 = trunc = 分钟数
        vm.fmul(4, 3, 1); // D4 = 分钟数 * 60
        vm.fsub(4, 2, 4); // D4 = 秒数 - D4 = 秒
        vm.fcvtzs(VReg.S2, 4); // S2 = 秒
        vm.fmov(2, 3); // D2 = 分钟数

        // 分 = 分钟数 % 60
        vm.fdiv(3, 2, 1); // D3 = 分钟数 / 60
        vm.ftrunc(3, 3); // D3 = trunc = 小时数
        vm.fmul(4, 3, 1);
        vm.fsub(4, 2, 4); // D4 = 分
        vm.fcvtzs(VReg.S3, 4); // S3 = 分
        vm.fmov(2, 3); // D2 = 小时数

        // 时 = 小时数 % 24
        vm.movImm(VReg.V0, 24);
        vm.scvtf(1, VReg.V0); // D1 = 24.0
        vm.fdiv(3, 2, 1);
        vm.ftrunc(3, 3); // D3 = 天数
        vm.fmul(4, 3, 1);
        vm.fsub(4, 2, 4); // D4 = 时
        vm.fcvtzs(VReg.S4, 4); // S4 = 时
        vm.fcvtzs(VReg.S5, 3); // S5 = 天数 (整数)

        // 保存时分秒毫秒到栈
        vm.store(VReg.SP, 0, VReg.S1); // [SP+0] = 毫秒
        vm.store(VReg.SP, 8, VReg.S2); // [SP+8] = 秒
        vm.store(VReg.SP, 16, VReg.S3); // [SP+16] = 分
        vm.store(VReg.SP, 24, VReg.S4); // [SP+24] = 时

        // 计算年月日
        vm.mov(VReg.A0, VReg.S5); // 传入天数
        vm.call("_date_days_to_ymd");

        // 解码年月日
        vm.mov(VReg.S0, VReg.RET);
        vm.movImm(VReg.V0, 10000);
        vm.div(VReg.S3, VReg.S0, VReg.V0); // S3 = year
        vm.mod(VReg.S0, VReg.S0, VReg.V0);
        vm.movImm(VReg.V0, 100);
        vm.div(VReg.S4, VReg.S0, VReg.V0); // S4 = month
        vm.mod(VReg.S5, VReg.S0, VReg.V0); // S5 = day

        // 分配字符串: 16字节头部(type+length) + 24字节内容 + 1字节 NUL = 41, 对齐到 48
        vm.movImm(VReg.A0, 48);
        vm.call("_alloc");
        // RET = X0，先保存到栈，因为后面 movImm 会覆盖 X0
        vm.store(VReg.SP, 32, VReg.RET); // 保存字符串指针到栈

        // 重新加载到 S0 (callee-saved, 不会被覆盖)
        vm.load(VReg.S0, VReg.SP, 32);

        // 设置字符串头: [type=6][length=24]
        vm.movImm(VReg.V0, TYPE_STRING);
        vm.store(VReg.S0, 0, VReg.V0);
        vm.movImm(VReg.V0, 24); // 字符串长度
        vm.store(VReg.S0, 8, VReg.V0);

        // 内容从 offset 16 开始
        // 格式: YYYY-MM-DDTHH:mm:ss.sssZ

        // 写入年 (4位) 到 [RET+16..RET+19]
        vm.load(VReg.S0, VReg.SP, 32); // 重新加载字符串指针
        vm.addImm(VReg.S0, VReg.S0, 16); // S0 = 内容起始地址
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A1, VReg.S3); // year
        vm.call("_write_int_padded_4");

        // 写入 '-' 到 [RET+20]
        vm.load(VReg.S0, VReg.SP, 32);
        vm.movImm(VReg.V0, 45); // '-'
        vm.storeByte(VReg.S0, 20, VReg.V0);

        // 写入月 (2位) 到 [RET+21..RET+22]
        vm.load(VReg.S0, VReg.SP, 32);
        vm.addImm(VReg.V1, VReg.S0, 21);
        vm.mov(VReg.A0, VReg.V1);
        vm.mov(VReg.A1, VReg.S4); // month
        vm.call("_write_int_padded_2");

        // 写入 '-' 到 [RET+23]
        vm.load(VReg.S0, VReg.SP, 32);
        vm.movImm(VReg.V0, 45);
        vm.storeByte(VReg.S0, 23, VReg.V0);

        // 写入日 (2位) 到 [RET+24..RET+25]
        vm.load(VReg.S0, VReg.SP, 32);
        vm.addImm(VReg.V1, VReg.S0, 24);
        vm.mov(VReg.A0, VReg.V1);
        vm.mov(VReg.A1, VReg.S5); // day
        vm.call("_write_int_padded_2");

        // 写入 'T' 到 [RET+26]
        vm.load(VReg.S0, VReg.SP, 32);
        vm.movImm(VReg.V0, 84); // 'T'
        vm.storeByte(VReg.S0, 26, VReg.V0);

        // 写入时 (2位) 到 [RET+27..RET+28]
        vm.load(VReg.S0, VReg.SP, 32);
        vm.addImm(VReg.V1, VReg.S0, 27);
        vm.mov(VReg.A0, VReg.V1);
        vm.load(VReg.A1, VReg.SP, 24); // 时
        vm.call("_write_int_padded_2");

        // 写入 ':' 到 [RET+29]
        vm.load(VReg.S0, VReg.SP, 32);
        vm.movImm(VReg.V0, 58); // ':'
        vm.storeByte(VReg.S0, 29, VReg.V0);

        // 写入分 (2位) 到 [RET+30..RET+31]
        vm.load(VReg.S0, VReg.SP, 32);
        vm.addImm(VReg.V1, VReg.S0, 30);
        vm.mov(VReg.A0, VReg.V1);
        vm.load(VReg.A1, VReg.SP, 16); // 分
        vm.call("_write_int_padded_2");

        // 写入 ':' 到 [RET+32]
        vm.load(VReg.S0, VReg.SP, 32);
        vm.movImm(VReg.V0, 58);
        vm.storeByte(VReg.S0, 32, VReg.V0);

        // 写入秒 (2位) 到 [RET+33..RET+34]
        vm.load(VReg.S0, VReg.SP, 32);
        vm.addImm(VReg.V1, VReg.S0, 33);
        vm.mov(VReg.A0, VReg.V1);
        vm.load(VReg.A1, VReg.SP, 8); // 秒
        vm.call("_write_int_padded_2");

        // 写入 '.' 到 [RET+35]
        vm.load(VReg.S0, VReg.SP, 32);
        vm.movImm(VReg.V0, 46); // '.'
        vm.storeByte(VReg.S0, 35, VReg.V0);

        // 写入毫秒 (3位) 到 [RET+36..RET+38]
        vm.load(VReg.S0, VReg.SP, 32);
        vm.addImm(VReg.V1, VReg.S0, 36);
        vm.mov(VReg.A0, VReg.V1);
        vm.load(VReg.A1, VReg.SP, 0); // 毫秒
        vm.call("_write_int_padded_3");

        // 写入 'Z' 到 [RET+39]
        vm.load(VReg.S0, VReg.SP, 32);
        vm.movImm(VReg.V0, 90); // 'Z'
        vm.storeByte(VReg.S0, 39, VReg.V0);

        // 写入 NUL 到 [RET+40]
        vm.movImm(VReg.V0, 0);
        vm.storeByte(VReg.S0, 40, VReg.V0);

        // 返回完整字符串对象指针 (包含头部)
        // _print_value 检测到 TYPE_STRING 后会跳过 16 字节头部
        vm.load(VReg.RET, VReg.SP, 32);

        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 64);

        // 辅助函数
        this.generateDaysToYMD();
        this.generateWritePadded(); // 新的写入函数，不打印
        this.generateParseISO(); // ISO 字符串解析
    }

    // 打印单个字符 (保留给其他地方使用)
    printChar(charCode) {
        const vm = this.vm;
        vm.movImm(VReg.V1, charCode);
        vm.push(VReg.V1);
        vm.movImm(VReg.A0, 1);
        vm.mov(VReg.A1, VReg.SP);
        vm.movImm(VReg.A2, 1);
        this.emitWriteCall();
        vm.pop(VReg.V1);
    }

    // 天数转年月日 (简化版 - 使用循环)
    // A0 = 从 1970-01-01 的天数
    // 返回: RET = year * 10000 + month * 100 + day
    generateDaysToYMD() {
        const vm = this.vm;

        vm.label("_date_days_to_ymd");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        // S0 = 剩余天数 (从 1970-01-01)
        vm.mov(VReg.S0, VReg.A0);
        vm.movImm(VReg.S1, 1970); // S1 = 年份

        // 年循环 - 每次检查当前年份的天数
        const yearLoop = "_date_ymd_year_loop";
        const yearDone = "_date_ymd_year_done";

        vm.label(yearLoop);
        // 计算当前年份的天数 (365 或 366)
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_date_year_days");
        vm.mov(VReg.S2, VReg.RET); // S2 = 该年天数

        // 如果剩余天数 < 该年天数，跳出循环
        vm.cmp(VReg.S0, VReg.S2);
        vm.jlt(yearDone);

        // 减去该年天数，年份加 1
        vm.sub(VReg.S0, VReg.S0, VReg.S2);
        vm.addImm(VReg.S1, VReg.S1, 1);
        vm.jmp(yearLoop);

        vm.label(yearDone);
        // S0 = 年内第几天 (0-based), S1 = 年份

        // 月循环
        vm.movImm(VReg.S2, 1); // S2 = 月份 (1-12)

        const monthLoop = "_date_ymd_month_loop";
        const monthDone = "_date_ymd_month_done";

        vm.label(monthLoop);
        vm.mov(VReg.A0, VReg.S1); // year
        vm.mov(VReg.A1, VReg.S2); // month
        vm.call("_date_month_days");
        vm.mov(VReg.S3, VReg.RET); // S3 = 该月天数

        vm.cmp(VReg.S0, VReg.S3);
        vm.jlt(monthDone);
        vm.sub(VReg.S0, VReg.S0, VReg.S3);
        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.jmp(monthLoop);

        vm.label(monthDone);

        // S0 = day-1, S1 = year, S2 = month
        vm.addImm(VReg.S0, VReg.S0, 1); // day (1-based)

        // 编码返回值: year * 10000 + month * 100 + day
        // 使用 V2 作为临时，避免 V0/RET 同寄存器问题
        vm.movImm(VReg.V2, 10000);
        vm.mul(VReg.RET, VReg.S1, VReg.V2);
        vm.movImm(VReg.V2, 100);
        vm.mul(VReg.V1, VReg.S2, VReg.V2);
        vm.add(VReg.RET, VReg.RET, VReg.V1);
        vm.add(VReg.RET, VReg.RET, VReg.S0);

        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);

        // _date_year_days: A0 = year, 返回该年天数 (365 或 366)
        // 注意：A0 = V0 = X0，所以必须先保存参数
        vm.label("_date_year_days");
        vm.mov(VReg.V2, VReg.A0); // 保存 year 到 V2，因为 V0 = A0 = X0

        // 简化闰年判断
        vm.movImm(VReg.V0, 400);
        vm.mod(VReg.V1, VReg.V2, VReg.V0); // 用 V2 (year) 而不是 A0
        vm.cmpImm(VReg.V1, 0);
        const yd_not400 = "_date_yd_not400";
        vm.jne(yd_not400);
        vm.movImm(VReg.RET, 366);
        vm.ret();

        vm.label(yd_not400);
        vm.movImm(VReg.V0, 100);
        vm.mod(VReg.V1, VReg.V2, VReg.V0); // 用 V2 (year)
        vm.cmpImm(VReg.V1, 0);
        const yd_not100 = "_date_yd_not100";
        vm.jne(yd_not100);
        vm.movImm(VReg.RET, 365);
        vm.ret();

        vm.label(yd_not100);
        vm.movImm(VReg.V0, 4);
        vm.mod(VReg.V1, VReg.V2, VReg.V0); // 用 V2 (year)
        vm.cmpImm(VReg.V1, 0);
        const yd_not4 = "_date_yd_not4";
        vm.jne(yd_not4);
        vm.movImm(VReg.RET, 366);
        vm.ret();

        vm.label(yd_not4);
        vm.movImm(VReg.RET, 365);
        vm.ret();

        // _date_month_days: A0 = year, A1 = month, 返回该月天数
        vm.label("_date_month_days");
        vm.prologue(16, [VReg.S0, VReg.S1]);
        vm.mov(VReg.S0, VReg.A0); // 保存 year
        vm.mov(VReg.S1, VReg.A1); // 保存 month

        // 二月特殊处理
        vm.cmpImm(VReg.S1, 2);
        const md_not_feb = "_date_md_not_feb";
        vm.jne(md_not_feb);

        // 二月: 判断闰年
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_date_year_days");
        vm.cmpImm(VReg.RET, 366);
        const md_feb_not_leap = "_date_md_feb_not_leap";
        vm.jne(md_feb_not_leap);
        vm.movImm(VReg.RET, 29);
        vm.epilogue([VReg.S0, VReg.S1], 16);

        vm.label(md_feb_not_leap);
        vm.movImm(VReg.RET, 28);
        vm.epilogue([VReg.S0, VReg.S1], 16);

        vm.label(md_not_feb);
        // 4,6,9,11 月 30 天
        vm.cmpImm(VReg.S1, 4);
        const md_not_30_4 = "_date_md_not_30_4";
        vm.jne(md_not_30_4);
        vm.movImm(VReg.RET, 30);
        vm.epilogue([VReg.S0, VReg.S1], 16);

        vm.label(md_not_30_4);
        vm.cmpImm(VReg.S1, 6);
        const md_not_30_6 = "_date_md_not_30_6";
        vm.jne(md_not_30_6);
        vm.movImm(VReg.RET, 30);
        vm.epilogue([VReg.S0, VReg.S1], 16);

        vm.label(md_not_30_6);
        vm.cmpImm(VReg.S1, 9);
        const md_not_30_9 = "_date_md_not_30_9";
        vm.jne(md_not_30_9);
        vm.movImm(VReg.RET, 30);
        vm.epilogue([VReg.S0, VReg.S1], 16);

        vm.label(md_not_30_9);
        vm.cmpImm(VReg.S1, 11);
        const md_not_30_11 = "_date_md_not_30_11";
        vm.jne(md_not_30_11);
        vm.movImm(VReg.RET, 30);
        vm.epilogue([VReg.S0, VReg.S1], 16);

        vm.label(md_not_30_11);
        // 其他月 31 天
        vm.movImm(VReg.RET, 31);
        vm.epilogue([VReg.S0, VReg.S1], 16);
    }

    // 写入到内存的带前导零辅助函数 (不打印)
    // A0 = 目标地址, A1 = 数值
    // 注意: A0=X0, A1=X1, V0=X0, V1=X1, 所以必须使用 V3, V4, V5 等不冲突的寄存器
    generateWritePadded() {
        const vm = this.vm;

        // 写入 4 位数字 (年份) 到内存
        // A0 = 目标地址, A1 = 数值
        vm.label("_write_int_padded_4");
        // 叶子函数，使用 V3-V5 避免覆盖 A0/A1

        // 千位
        vm.movImm(VReg.V3, 1000);
        vm.div(VReg.V4, VReg.A1, VReg.V3);
        vm.addImm(VReg.V4, VReg.V4, 48); // +'0'
        vm.storeByte(VReg.A0, 0, VReg.V4);

        // 百位
        vm.mod(VReg.V5, VReg.A1, VReg.V3);
        vm.movImm(VReg.V3, 100);
        vm.div(VReg.V4, VReg.V5, VReg.V3);
        vm.addImm(VReg.V4, VReg.V4, 48);
        vm.storeByte(VReg.A0, 1, VReg.V4);

        // 十位
        vm.mod(VReg.V5, VReg.V5, VReg.V3);
        vm.movImm(VReg.V3, 10);
        vm.div(VReg.V4, VReg.V5, VReg.V3);
        vm.addImm(VReg.V4, VReg.V4, 48);
        vm.storeByte(VReg.A0, 2, VReg.V4);

        // 个位
        vm.mod(VReg.V4, VReg.V5, VReg.V3);
        vm.addImm(VReg.V4, VReg.V4, 48);
        vm.storeByte(VReg.A0, 3, VReg.V4);

        vm.ret();

        // 写入 3 位数字 (毫秒) 到内存
        // A0 = 目标地址, A1 = 数值
        vm.label("_write_int_padded_3");

        // 百位
        vm.movImm(VReg.V3, 100);
        vm.div(VReg.V4, VReg.A1, VReg.V3);
        vm.addImm(VReg.V4, VReg.V4, 48);
        vm.storeByte(VReg.A0, 0, VReg.V4);

        // 十位
        vm.mod(VReg.V5, VReg.A1, VReg.V3);
        vm.movImm(VReg.V3, 10);
        vm.div(VReg.V4, VReg.V5, VReg.V3);
        vm.addImm(VReg.V4, VReg.V4, 48);
        vm.storeByte(VReg.A0, 1, VReg.V4);

        // 个位
        vm.mod(VReg.V4, VReg.V5, VReg.V3);
        vm.addImm(VReg.V4, VReg.V4, 48);
        vm.storeByte(VReg.A0, 2, VReg.V4);

        vm.ret();

        // 写入 2 位数字 到内存
        // A0 = 目标地址, A1 = 数值
        vm.label("_write_int_padded_2");

        // 十位
        vm.movImm(VReg.V3, 10);
        vm.div(VReg.V4, VReg.A1, VReg.V3);
        vm.addImm(VReg.V4, VReg.V4, 48);
        vm.storeByte(VReg.A0, 0, VReg.V4);

        // 个位
        vm.mod(VReg.V4, VReg.A1, VReg.V3);
        vm.addImm(VReg.V4, VReg.V4, 48);
        vm.storeByte(VReg.A0, 1, VReg.V4);

        vm.ret();
    }

    // 带前导零打印 (保留以供其他用途)
    generatePaddedPrint() {
        const vm = this.vm;

        // 打印 4 位数字 (年份)
        vm.label("_print_int_padded_4");
        vm.prologue(16, [VReg.S0, VReg.S1]);
        vm.mov(VReg.S0, VReg.A0);

        // 千位
        vm.movImm(VReg.S1, 1000);
        vm.div(VReg.V1, VReg.S0, VReg.S1);
        vm.addImm(VReg.V1, VReg.V1, 48);
        this.printCharFromReg(VReg.V1);

        // 百位
        vm.mod(VReg.S0, VReg.S0, VReg.S1);
        vm.movImm(VReg.S1, 100);
        vm.div(VReg.V1, VReg.S0, VReg.S1);
        vm.addImm(VReg.V1, VReg.V1, 48);
        this.printCharFromReg(VReg.V1);

        // 十位
        vm.mod(VReg.S0, VReg.S0, VReg.S1);
        vm.movImm(VReg.S1, 10);
        vm.div(VReg.V1, VReg.S0, VReg.S1);
        vm.addImm(VReg.V1, VReg.V1, 48);
        this.printCharFromReg(VReg.V1);

        // 个位
        vm.mod(VReg.V1, VReg.S0, VReg.S1);
        vm.addImm(VReg.V1, VReg.V1, 48);
        this.printCharFromReg(VReg.V1);

        vm.epilogue([VReg.S0, VReg.S1], 16);

        // 打印 3 位数字 (毫秒)
        vm.label("_print_int_padded_3");
        vm.prologue(16, [VReg.S0, VReg.S1]);
        vm.mov(VReg.S0, VReg.A0);

        // 百位
        vm.movImm(VReg.S1, 100);
        vm.div(VReg.V1, VReg.S0, VReg.S1);
        vm.addImm(VReg.V1, VReg.V1, 48);
        this.printCharFromReg(VReg.V1);

        // 十位
        vm.mod(VReg.S0, VReg.S0, VReg.S1);
        vm.movImm(VReg.S1, 10);
        vm.div(VReg.V1, VReg.S0, VReg.S1);
        vm.addImm(VReg.V1, VReg.V1, 48);
        this.printCharFromReg(VReg.V1);

        // 个位
        vm.mod(VReg.V1, VReg.S0, VReg.S1);
        vm.addImm(VReg.V1, VReg.V1, 48);
        this.printCharFromReg(VReg.V1);

        vm.epilogue([VReg.S0, VReg.S1], 16);

        // 打印 2 位数字
        vm.label("_print_int_padded_2");
        vm.prologue(16, [VReg.S0, VReg.S1]);
        vm.mov(VReg.S0, VReg.A0);

        // 十位
        vm.movImm(VReg.S1, 10);
        vm.div(VReg.V1, VReg.S0, VReg.S1);
        vm.addImm(VReg.V1, VReg.V1, 48);
        this.printCharFromReg(VReg.V1);

        // 个位
        vm.mod(VReg.V1, VReg.S0, VReg.S1);
        vm.addImm(VReg.V1, VReg.V1, 48);
        this.printCharFromReg(VReg.V1);

        vm.epilogue([VReg.S0, VReg.S1], 16);
    }

    // 从寄存器打印字符
    printCharFromReg(reg) {
        const vm = this.vm;
        vm.push(reg);
        vm.movImm(VReg.A0, 1);
        vm.mov(VReg.A1, VReg.SP);
        vm.movImm(VReg.A2, 1);
        this.emitWriteCall();
        vm.pop(reg);
    }

    // 生成 write 系统调用
    emitWriteCall() {
        const vm = this.vm;
        if (vm.platform === "windows") {
            vm.callWindowsWriteConsole();
        } else if (vm.arch === "arm64") {
            vm.syscall(vm.platform === "linux" ? 64 : 4);
        } else {
            vm.syscall(vm.platform === "linux" ? 1 : 0x2000004);
        }
    }

    // 解析 ISO 8601 字符串为时间戳
    // 格式: YYYY-MM-DDTHH:mm:ss.sssZ (24 字符)
    // A0 = 字符串指针
    // 返回: 时间戳 (IEEE 754 浮点位模式)
    generateParseISO() {
        const vm = this.vm;
        const arch = vm.arch;

        vm.label("_date_parse_iso");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);
        vm.mov(VReg.S0, VReg.A0); // S0 = 字符串指针

        // 解析年 (4位): 位置 0-3
        vm.mov(VReg.A0, VReg.S0);
        vm.movImm(VReg.A1, 4);
        vm.call("_parse_int_n");
        vm.mov(VReg.S1, VReg.RET); // S1 = year

        // 解析月 (2位): 位置 5-6 (跳过 '-')
        vm.addImm(VReg.A0, VReg.S0, 5);
        vm.movImm(VReg.A1, 2);
        vm.call("_parse_int_n");
        vm.mov(VReg.S2, VReg.RET); // S2 = month

        // 解析日 (2位): 位置 8-9
        vm.addImm(VReg.A0, VReg.S0, 8);
        vm.movImm(VReg.A1, 2);
        vm.call("_parse_int_n");
        vm.mov(VReg.S3, VReg.RET); // S3 = day

        // 解析时 (2位): 位置 11-12 (跳过 'T')
        vm.addImm(VReg.A0, VReg.S0, 11);
        vm.movImm(VReg.A1, 2);
        vm.call("_parse_int_n");
        vm.store(VReg.SP, 0, VReg.RET); // [SP+0] = hour

        // 解析分 (2位): 位置 14-15
        vm.addImm(VReg.A0, VReg.S0, 14);
        vm.movImm(VReg.A1, 2);
        vm.call("_parse_int_n");
        vm.store(VReg.SP, 8, VReg.RET); // [SP+8] = minute

        // 解析秒 (2位): 位置 17-18
        vm.addImm(VReg.A0, VReg.S0, 17);
        vm.movImm(VReg.A1, 2);
        vm.call("_parse_int_n");
        vm.store(VReg.SP, 16, VReg.RET); // [SP+16] = second

        // 解析毫秒 (3位): 位置 20-22 (跳过 '.')
        vm.addImm(VReg.A0, VReg.S0, 20);
        vm.movImm(VReg.A1, 3);
        vm.call("_parse_int_n");
        vm.store(VReg.SP, 24, VReg.RET); // [SP+24] = millisecond

        // 计算从 1970-01-01 的总天数
        // days = _date_ymd_to_days(year, month, day)
        vm.mov(VReg.A0, VReg.S1); // year
        vm.mov(VReg.A1, VReg.S2); // month
        vm.mov(VReg.A2, VReg.S3); // day
        vm.call("_date_ymd_to_days");
        vm.mov(VReg.S4, VReg.RET); // S4 = days

        // 计算时间戳 (毫秒)
        // timestamp = ((days * 24 + hour) * 60 + minute) * 60 + second) * 1000 + ms
        // 使用浮点运算避免溢出

        // D0 = days
        vm.scvtf(0, VReg.S4); // D0 = (double)days
        // D0 = days * 24
        vm.movImm(VReg.V3, 24);
        vm.scvtf(1, VReg.V3);
        vm.fmul(0, 0, 1);
        // D0 = D0 + hour
        vm.load(VReg.V3, VReg.SP, 0);
        vm.scvtf(1, VReg.V3);
        vm.fadd(0, 0, 1);
        // D0 = D0 * 60
        vm.movImm(VReg.V3, 60);
        vm.scvtf(1, VReg.V3);
        vm.fmul(0, 0, 1);
        // D0 = D0 + minute
        vm.load(VReg.V3, VReg.SP, 8);
        vm.scvtf(1, VReg.V3);
        vm.fadd(0, 0, 1);
        // D0 = D0 * 60
        vm.movImm(VReg.V3, 60);
        vm.scvtf(1, VReg.V3);
        vm.fmul(0, 0, 1);
        // D0 = D0 + second
        vm.load(VReg.V3, VReg.SP, 16);
        vm.scvtf(1, VReg.V3);
        vm.fadd(0, 0, 1);
        // D0 = D0 * 1000
        vm.movImm(VReg.V3, 1000);
        vm.scvtf(1, VReg.V3);
        vm.fmul(0, 0, 1);
        // D0 = D0 + millisecond
        vm.load(VReg.V3, VReg.SP, 24);
        vm.scvtf(1, VReg.V3);
        vm.fadd(0, 0, 1);
        // 返回位模式
        vm.fmovToInt(VReg.RET, 0);

        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 64);

        // _parse_int_n: 解析 N 位数字
        // A0 = 字符串指针, A1 = 位数
        // 返回: 解析的整数值
        vm.label("_parse_int_n");
        // 叶子函数，使用 V3-V5
        vm.movImm(VReg.V3, 0); // result = 0
        vm.movImm(VReg.V4, 0); // i = 0

        const parseLoop = "_parse_int_loop";
        const parseDone = "_parse_int_done";

        vm.label(parseLoop);
        vm.cmp(VReg.V4, VReg.A1);
        vm.jge(parseDone);

        // result = result * 10
        vm.movImm(VReg.V5, 10);
        vm.mul(VReg.V3, VReg.V3, VReg.V5);

        // 加载字符
        vm.loadByte(VReg.V5, VReg.A0, 0);
        vm.subImm(VReg.V5, VReg.V5, 48); // '0' = 48
        vm.add(VReg.V3, VReg.V3, VReg.V5);

        vm.addImm(VReg.A0, VReg.A0, 1); // ptr++
        vm.addImm(VReg.V4, VReg.V4, 1); // i++
        vm.jmp(parseLoop);

        vm.label(parseDone);
        vm.mov(VReg.RET, VReg.V3);
        vm.ret();

        // _date_ymd_to_days: 年月日转换为从 1970-01-01 的天数
        // A0 = year, A1 = month, A2 = day
        // 返回: 天数
        vm.label("_date_ymd_to_days");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // year
        vm.mov(VReg.S1, VReg.A1); // month
        vm.mov(VReg.S2, VReg.A2); // day

        // 计算从 1970 年到 year-1 的天数
        vm.movImm(VReg.S3, 0); // total_days = 0
        vm.movImm(VReg.V3, 1970); // y = 1970

        const yearLoop = "_ymd_year_loop";
        const yearDone = "_ymd_year_done";

        vm.label(yearLoop);
        vm.cmp(VReg.V3, VReg.S0);
        vm.jge(yearDone);

        vm.mov(VReg.A0, VReg.V3);
        vm.call("_date_year_days");
        vm.add(VReg.S3, VReg.S3, VReg.RET);
        vm.addImm(VReg.V3, VReg.V3, 1);
        vm.jmp(yearLoop);

        vm.label(yearDone);

        // 计算从 1 月到 month-1 的天数
        vm.movImm(VReg.V3, 1); // m = 1

        const monthLoop = "_ymd_month_loop";
        const monthDone = "_ymd_month_done";

        vm.label(monthLoop);
        vm.cmp(VReg.V3, VReg.S1);
        vm.jge(monthDone);

        vm.mov(VReg.A0, VReg.S0); // year
        vm.mov(VReg.A1, VReg.V3); // month
        vm.call("_date_month_days");
        vm.add(VReg.S3, VReg.S3, VReg.RET);
        vm.addImm(VReg.V3, VReg.V3, 1);
        vm.jmp(monthLoop);

        vm.label(monthDone);

        // 加上 day - 1
        vm.subImm(VReg.V3, VReg.S2, 1);
        vm.add(VReg.RET, VReg.S3, VReg.V3);

        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
    }
}
