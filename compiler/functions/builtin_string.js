// JSBin 编译器 - String 方法编译
// 编译 toUpperCase, toLowerCase, charAt, trim, slice 等字符串方法

import { VReg } from "../../vm/index.js";

// String 方法编译 Mixin
export const StringMethodCompiler = {
    // 编译 String 方法调用
    // str.toUpperCase(), str.toLowerCase(), str.charAt(i), str.trim() 等
    compileStringMethod(obj, method, args) {
        // 先编译字符串表达式
        this.compileExpression(obj);
        this.vm.push(VReg.RET); // 保存原始字符串

        switch (method) {
            case "toUpperCase":
                // str.toUpperCase() - 返回新字符串
                // 直接传递字符串给 _str_toUpperCase，它会处理 unboxing
                this.vm.pop(VReg.A0);
                this.vm.call("_str_toUpperCase");
                return true;

            case "toLowerCase":
                // str.toLowerCase() - 返回新字符串
                // 直接传递字符串给 _str_toLowerCase，它会处理 unboxing
                this.vm.pop(VReg.A0);
                this.vm.call("_str_toLowerCase");
                return true;

            case "charAt":
                // str.charAt(index) - 返回单字符字符串
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    // 索引是原始 float64 位模式，需要转为整数
                    this.vm.fmovToFloat(0, VReg.RET);
                    this.vm.fcvtzs(VReg.A1, 0);
                } else {
                    this.vm.movImm(VReg.A1, 0);
                }
                this.vm.pop(VReg.A0);
                this.vm.call("_str_charAt");
                return true;

            case "codePointAt":
                // ASCII/BMP 与 charCodeAt 等价(见 builtin_methods.js 同注);别名避免 default 崩。
            case "charCodeAt":
                // str.charCodeAt(index) - 返回字符编码
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    // 索引是原始 float64 位模式，需要转为整数
                    this.vm.fmovToFloat(0, VReg.RET);
                    this.vm.fcvtzs(VReg.A1, 0);
                } else {
                    this.vm.movImm(VReg.A1, 0);
                }
                this.vm.pop(VReg.A0);
                this.vm.call("_str_charCodeAt");
                // _str_charCodeAt 已返回标准 JS number（float64 位），无需装箱
                return true;

            case "trim":
                // str.trim() - 去除首尾空白
                this.vm.pop(VReg.A0);
                this.vm.call("_getStrContent");
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_str_trim");
                return true;

            case "slice":
                // str.slice(start, end) —— slice 语义(负→从末尾、start>end→空)。
                // substring 语义不同(负→0、swap),见下方独立 case。
                // 先获取字符串内容指针
                this.vm.pop(VReg.A0);
                this.vm.call("_getStrContent");
                this.vm.push(VReg.RET); // 保存内容指针

                // 编译 start 参数
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    this.vm.push(VReg.RET); // 保存 start
                } else {
                    this.vm.movImm64(VReg.V0, 0x7ffb000000000000n); // JS_UNDEFINED
                    this.vm.push(VReg.V0);
                }

                // 编译 end 参数
                if (args.length > 1) {
                    this.compileExpression(args[1]);
                    this.vm.mov(VReg.A2, VReg.RET);
                } else {
                    this.vm.movImm64(VReg.A2, 0x7ffb000000000000n); // JS_UNDEFINED
                }

                this.vm.pop(VReg.A1); // start
                this.vm.pop(VReg.A0); // str content
                this.vm.call("_str_slice");
                return true;

            case "substring":
                // str.substring(start[, end]) —— 负→0、start>end 交换。_str_substring
                // (A0=boxed str, A1=start, A2=end) 内部 getStrContent+clamp+swap。
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    this.vm.push(VReg.RET); // start,压在接收者之上
                } else {
                    this.vm.movImm64(VReg.V0, 0x7ff8000000000000n); // 0(boxed)
                    this.vm.push(VReg.V0);
                }
                if (args.length > 1) {
                    this.compileExpression(args[1]);
                    this.vm.mov(VReg.A2, VReg.RET);
                } else {
                    this.vm.movImm64(VReg.A2, 0x7ffb000000000000n); // JS_UNDEFINED
                }
                this.vm.pop(VReg.A1); // start
                this.vm.pop(VReg.A0); // 接收者(装箱串,未 getStrContent)
                this.vm.call("_str_substring");
                return true;

            case "indexOf":
                // str.indexOf(search) - 返回索引或 -1
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET);
                } else {
                    this.vm.lea(VReg.A1, "_str_empty");
                }
                this.vm.pop(VReg.A0);
                this.vm.call("_str_indexOf");
                // 装箱返回值为 Number 对象
                this.boxIntAsNumber(VReg.RET);
                return true;

            case "lastIndexOf":
                // str.lastIndexOf(search) - 返回最后出现的索引或 -1
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET);
                } else {
                    this.vm.lea(VReg.A1, "_str_empty");
                }
                this.vm.pop(VReg.A0);
                this.vm.call("_str_lastIndexOf");
                // 装箱返回值为 Number 对象
                this.boxIntAsNumber(VReg.RET);
                return true;

            case "includes":
                // str.includes(search[, pos]) - 返回布尔值
                if (args.length >= 2) {
                    // 带 position:receiver.substring(pos) 取尾串再 includes(尾串, search)。镜像 startsWith(pos)。
                    const incSearch = this.ctx.allocLocal(`__inc_search_${this.nextLabelId()}`);
                    this.compileExpression(args[0]);
                    this.vm.store(VReg.FP, incSearch, VReg.RET);
                    this.compileExpression(args[1]);
                    this.vm.mov(VReg.A1, VReg.RET);
                    this.vm.pop(VReg.A0);
                    this.vm.movImm64(VReg.A2, 0x7ffb000000000000n); // undefined → 到尾
                    this.vm.call("_str_substring");
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.load(VReg.A1, VReg.FP, incSearch);
                    this.vm.call("_str_includes");
                    return true;
                }
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET);
                } else {
                    this.vm.lea(VReg.A1, "_str_empty");
                }
                this.vm.pop(VReg.A0);
                this.vm.call("_str_includes");
                return true;

            case "startsWith":
                // str.startsWith(search[, pos]) - 返回布尔值(pos 支持见 builtin_methods.js 同注)
                if (args.length >= 2) {
                    const swSearch = this.ctx.allocLocal(`__sw_search_${this.nextLabelId()}`);
                    this.compileExpression(args[0]);
                    this.vm.store(VReg.FP, swSearch, VReg.RET);
                    this.compileExpression(args[1]);
                    this.vm.mov(VReg.A1, VReg.RET);
                    this.vm.pop(VReg.A0);
                    this.vm.movImm64(VReg.A2, 0x7ffb000000000000n);
                    this.vm.call("_str_substring");
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.load(VReg.A1, VReg.FP, swSearch);
                    this.vm.call("_str_startsWith");
                    return true;
                }
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET);
                } else {
                    this.vm.lea(VReg.A1, "_str_empty");
                }
                this.vm.pop(VReg.A0);
                this.vm.call("_str_startsWith");
                return true;

            case "endsWith":
                // str.endsWith(search[, endPos]) - 返回布尔值
                if (args.length >= 2) {
                    // 带 endPosition:receiver.substring(0, endPos) 取前缀再 endsWith(前缀, search)。
                    const ewSearch = this.ctx.allocLocal(`__ew_search_${this.nextLabelId()}`);
                    this.compileExpression(args[0]);
                    this.vm.store(VReg.FP, ewSearch, VReg.RET);
                    this.compileExpression(args[1]);
                    this.vm.mov(VReg.A2, VReg.RET);
                    this.vm.pop(VReg.A0);
                    this.vm.movImm64(VReg.A1, 0x7FF8000000000000n); // start = 0(boxed)
                    this.vm.call("_str_substring");
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.load(VReg.A1, VReg.FP, ewSearch);
                    this.vm.call("_str_endsWith");
                    return true;
                }
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET);
                } else {
                    this.vm.lea(VReg.A1, "_str_empty");
                }
                this.vm.pop(VReg.A0);
                this.vm.call("_str_endsWith");
                return true;

            case "repeat":
                // str.repeat(count) - 重复字符串
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET);
                } else {
                    this.vm.movImm(VReg.A1, 0);
                }
                this.vm.pop(VReg.A0);
                this.vm.call("_str_repeat");
                return true;

            case "padStart":
                // str.padStart(targetLen, padString)
                if (args.length >= 2) {
                    this.compileExpression(args[0]);
                    this.vm.push(VReg.RET);
                    this.compileExpression(args[1]);
                    this.vm.mov(VReg.A2, VReg.RET);
                    this.vm.pop(VReg.A1);
                    this.vm.pop(VReg.A0);
                    this.vm.call("_str_padStart");
                } else if (args.length === 1) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET);
                    // 默认填充串为空格(装箱 0x7FFC,同 2 参;`_str_space` 未定义致链接错)。
                    this.vm.lea(VReg.A2, this.asm.addString(" "));
                    this.vm.movImm64(VReg.V1, 0x7ffc000000000000n);
                    this.vm.or(VReg.A2, VReg.A2, VReg.V1);
                    this.vm.pop(VReg.A0);
                    this.vm.call("_str_padStart");
                } else {
                    this.vm.pop(VReg.RET);
                }
                return true;

            case "padEnd":
                // str.padEnd(targetLen, padString)
                if (args.length >= 2) {
                    this.compileExpression(args[0]);
                    this.vm.push(VReg.RET);
                    this.compileExpression(args[1]);
                    this.vm.mov(VReg.A2, VReg.RET);
                    this.vm.pop(VReg.A1);
                    this.vm.pop(VReg.A0);
                    this.vm.call("_str_padEnd");
                } else if (args.length === 1) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET);
                    // 默认填充串为空格(装箱 0x7FFC,同 2 参;`_str_space` 未定义致链接错)。
                    this.vm.lea(VReg.A2, this.asm.addString(" "));
                    this.vm.movImm64(VReg.V1, 0x7ffc000000000000n);
                    this.vm.or(VReg.A2, VReg.A2, VReg.V1);
                    this.vm.pop(VReg.A0);
                    this.vm.call("_str_padEnd");
                } else {
                    this.vm.pop(VReg.RET);
                }
                return true;

            case "trimStart":
            case "trimLeft":
                // str.trimStart()
                this.vm.pop(VReg.A0);
                this.vm.call("_str_trimStart");
                return true;

            case "normalize":
                // str.normalize():ASCII/已规范化恒等,返回原串(字节模型,记偏差)。
                this.vm.pop(VReg.A0);
                this.vm.mov(VReg.RET, VReg.A0);
                return true;

            case "trimEnd":
            case "trimRight":
                // str.trimEnd()
                this.vm.pop(VReg.A0);
                this.vm.call("_str_trimEnd");
                return true;

            case "at":
                // str.at(index) - 支持负数索引
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET);
                } else {
                    this.vm.movImm(VReg.A1, 0);
                }
                this.vm.pop(VReg.A0);
                this.vm.call("_str_at");
                return true;

            case "split":
                // str.split(separator[, limit]) - 返回数组
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET);
                } else {
                    this.vm.lea(VReg.A1, "_str_empty");
                }
                this.vm.pop(VReg.A0);
                this.vm.call("_str_split");
                if (args.length >= 2) {
                    // [limit] 截断到 limit 个元素(同 builtin_methods split)。
                    const splitResSlot = this.ctx.allocLocal(`__splitres2_${this.nextLabelId()}`);
                    this.vm.store(VReg.FP, splitResSlot, VReg.RET);
                    this.compileExpressionAsInt(args[1]);
                    const splitLimSlot = this.ctx.allocLocal(`__splitlim2_${this.nextLabelId()}`);
                    this.vm.store(VReg.FP, splitLimSlot, VReg.RET);
                    this.vm.load(VReg.A0, VReg.FP, splitResSlot);
                    this.vm.call("_js_unbox");
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.movImm(VReg.A1, 0);
                    this.vm.load(VReg.A2, VReg.FP, splitLimSlot);
                    this.vm.call("_array_slice");
                    this.vm.call("_box_arr_r"); // box->helper
                }
                return true;

            case "concat":
                // str.concat(a, b, c, ...) - 逐参串接(此前只用 args[0],丢弃其余)
                this.vm.pop(VReg.A0); // A0 = 接收者(装箱串)
                if (args.length === 0) {
                    this.vm.mov(VReg.RET, VReg.A0);
                    return true;
                }
                for (let ci = 0; ci < args.length; ci++) {
                    this.vm.push(VReg.A0);
                    this.compileExpression(args[ci]);
                    this.vm.mov(VReg.A1, VReg.RET);
                    this.vm.pop(VReg.A0);
                    this.vm.call("_strconcat");
                    this.vm.mov(VReg.A0, VReg.RET);
                }
                this.vm.mov(VReg.RET, VReg.A0);
                return true;
        }

        // 未处理的方法，弹出栈
        this.vm.pop(VReg.V0);
        return false;
    },
};
