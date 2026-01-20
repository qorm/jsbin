// JSBin 编译上下文
// 管理变量、标签、作用域和函数

import { Type } from "./types.js";

export class CompileContext {
    constructor(funcName) {
        this.funcName = funcName || "main";
        this.locals = {}; // 变量名 -> 栈偏移量
        this.varTypes = {}; // 变量名 -> 类型（静态类型系统）
        this.varInitExprs = {}; // 变量名 -> 初始化表达式 AST（用于类型推断）
        this.stackOffset = 0; // 当前栈偏移
        this.labelCounter = 0; // 标签计数器
        this.returnLabel = ""; // 当前函数的返回标签
        this.functions = {}; // 函数声明: 函数名 -> AST 节点
        this.isAsync = false; // 是否是异步函数

        // 使用函数名作为标签前缀，避免跨函数标签冲突
        this.labelPrefix = this.funcName + "_";

        // 全局变量支持
        this.globals = {}; // 全局变量名 -> 数据段标签名
        this.globalOffset = 0; // 下一个全局变量的偏移

        // 主程序被捕获的变量（被顶层函数访问）
        // 变量名 -> 全局标签名（存储 box 指针的位置）
        this.mainCapturedVars = {};

        // 共享变量支持 (闭包)
        this.sharedVars = null; // 共享变量 -> 环境对象偏移
        this.envOffset = null; // 环境对象在栈上的偏移
        this.envPtrOffset = null; // 闭包中环境指针的偏移

        // 作用域深度
        this.scopeDepth = 0;

        // 循环控制
        this.breakLabel = null; // break 目标标签
        this.continueLabel = null; // continue 目标标签
    }

    // 兼容旧接口
    get name() {
        return this.funcName;
    }

    // 设置标签前缀
    setLabelPrefix(prefix) {
        this.labelPrefix = prefix;
    }

    // 生成唯一标签
    newLabel(prefix) {
        this.labelCounter = this.labelCounter + 1;
        return this.labelPrefix + prefix + "_" + this.labelCounter;
    }

    // 分配全局变量（存储在数据段）
    allocGlobal(name) {
        let label = "_global_" + name;
        this.globals[name] = label;
        return label;
    }

    // 获取全局变量标签
    getGlobal(name) {
        return this.globals[name];
    }

    // 注册主程序被捕获变量的全局存储位置
    allocMainCapturedVar(name) {
        let label = "_main_captured_" + name;
        this.mainCapturedVars[name] = label;
        return label;
    }

    // 获取主程序被捕获变量的全局标签
    getMainCapturedVar(name) {
        return this.mainCapturedVars[name];
    }

    // 分配局部变量（带类型）
    allocLocal(name, type = Type.UNKNOWN) {
        this.stackOffset = this.stackOffset + 8;
        this.locals[name] = -this.stackOffset;
        this.varTypes[name] = type;
        return this.locals[name];
    }

    // 获取局部变量偏移
    getLocal(name) {
        return this.locals[name];
    }

    // 设置变量类型
    setVarType(name, type) {
        this.varTypes[name] = type;
    }

    // 获取变量类型
    getVarType(name) {
        return this.varTypes[name] || Type.UNKNOWN;
    }

    // 检查变量是否是整数类型
    isIntVar(name) {
        const type = this.varTypes[name];
        // Int8-64, Uint8-64 都是整数类型
        return type && (type.startsWith("int") || type.startsWith("uint"));
    }

    // 检查变量是否存在（局部或全局）
    hasVariable(name) {
        return this.locals[name] !== undefined || this.globals[name] !== undefined;
    }

    // 进入新作用域
    enterScope() {
        // 手动复制 locals 对象
        let copyLocals = {};
        for (let key in this.locals) {
            copyLocals[key] = this.locals[key];
        }
        this.scopeDepth = (this.scopeDepth || 0) + 1;
        return {
            locals: copyLocals,
            stackOffset: this.stackOffset,
            scopeDepth: this.scopeDepth - 1,
            breakLabel: this.breakLabel,
            continueLabel: this.continueLabel,
        };
    }

    // 离开作用域
    leaveScope(saved) {
        this.locals = saved.locals;
        this.stackOffset = saved.stackOffset;
        this.scopeDepth = saved.scopeDepth;
        this.breakLabel = saved.breakLabel;
        this.continueLabel = saved.continueLabel;
    }

    // 检查当前是否在嵌套作用域中（非顶层）
    isInNestedScope() {
        return (this.scopeDepth || 0) > 0;
    }

    // 设置循环标签
    setLoopLabels(breakLabel, continueLabel) {
        this.breakLabel = breakLabel;
        this.continueLabel = continueLabel;
    }

    // 注册函数声明
    registerFunction(name, node) {
        this.functions[name] = node;
    }

    // 获取函数声明
    getFunction(name) {
        return this.functions[name];
    }

    // 检查是否是已注册的函数
    hasFunction(name) {
        return this.functions[name] !== undefined;
    }

    // 克隆上下文（用于编译嵌套函数）
    clone(newFuncName) {
        let newCtx = new CompileContext(newFuncName);
        // 复制函数注册表
        for (let key in this.functions) {
            newCtx.functions[key] = this.functions[key];
        }
        // 复制全局变量
        for (let key in this.globals) {
            newCtx.globals[key] = this.globals[key];
        }
        // 复制主程序被捕获变量
        for (let key in this.mainCapturedVars) {
            newCtx.mainCapturedVars[key] = this.mainCapturedVars[key];
        }
        return newCtx;
    }
}

// 编译选项
export class CompileOptions {
    constructor() {
        this.outputType = "executable"; // executable, shared, object
        this.debug = false; // 生成调试信息
        this.optimize = 0; // 优化级别 0-3
        this.heapSize = 1048576; // 默认堆大小 1MB
        this.maxHeapSize = 0; // 最大堆大小，0 = 无限制
        this.numWorkers = 0; // 工作线程数，0 = 单线程
    }
}

// 编译结果
export class CompileResult {
    constructor() {
        this.success = false;
        this.binary = null;
        this.error = null;
        this.outputFile = null;
        this.size = 0;
    }

    static success(binary, outputFile) {
        let result = new CompileResult();
        result.success = true;
        result.binary = binary;
        result.outputFile = outputFile;
        result.size = binary.length;
        return result;
    }

    static failure(error) {
        let result = new CompileResult();
        result.success = false;
        result.error = error;
        return result;
    }
}
