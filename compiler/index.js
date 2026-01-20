// JSBin 统一编译器 - 重构版
// 将 JavaScript 源码编译为各平台可执行文件
//
// 模块化结构:
// - core/: 上下文、平台、类型、代码生成
// - expressions/: 表达式编译
// - functions/: 函数和语句编译
// - output/: 库文件、包装器、二进制生成

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";

// 语言前端
import { Lexer, Parser } from "../lang/index.js";
import { analyzeCapturedVariables, analyzeSharedVariables, analyzeTopLevelSharedVariables } from "../lang/analysis/closure.js";

// 虚拟机和汇编器
import { VirtualMachine, VReg } from "../vm/index.js";
import { ARM64Assembler } from "../asm/arm64.js";
import { X64Assembler } from "../asm/x64.js";

// 运行时
import { AllocatorGenerator, RuntimeGenerator, NumberGenerator, StringConstantsGenerator, AsyncGenerator } from "../runtime/index.js";

// 编译上下文和平台
import { CompileContext, CompileOptions, CompileResult } from "./core/context.js";
import { detectPlatform, getTargetInfo, resolveTarget, listTargets, TARGETS } from "./core/platform.js";

// 编译器模块
import { StatementCompiler } from "./functions/statements.js";
import { ExpressionCompiler } from "./expressions/expressions.js";
import { FunctionCompiler } from "./functions/functions.js";
import { isAsyncFunction } from "./async/index.js";

// 输出模块
import { parseJslibFile, LibraryManager } from "./output/library.js";
import { WrapperGenerator } from "./output/wrapper.js";
import { BinaryOutputGenerator } from "./output/generator.js";

// 静态链接器
import { StaticLinker } from "../binary/static_linker.js";

// 重新导出
export { detectPlatform, getTargetInfo, resolveTarget, listTargets, TARGETS } from "./core/platform.js";
export { CompileContext, CompileOptions, CompileResult } from "./core/context.js";
export { BinaryGenerator, OutputType, pageAlign, align16, align } from "../binary/binary_format.js";
export { parseJslibFile, LibraryManager } from "./output/library.js";

// 目标平台配置
const Targets = {
    "linux-arm64": { arch: "arm64", os: "linux", ext: "" },
    "linux-x64": { arch: "x64", os: "linux", ext: "" },
    "macos-arm64": { arch: "arm64", os: "macos", ext: "" },
    "macos-x64": { arch: "x64", os: "macos", ext: "" },
    "windows-x64": { arch: "x64", os: "windows", ext: ".exe" },
};

export class Compiler {
    constructor(target) {
        this.target = target || "linux-arm64";
        const targetInfo = Targets[this.target];
        if (!targetInfo) {
            throw new Error("Unknown target: " + target);
        }

        this.arch = targetInfo.arch;
        this.os = targetInfo.os;

        // 创建汇编器
        this._initAssembler();

        // 创建虚拟机 (VM 内部创建 backend)
        this.vm = new VirtualMachine(this.arch, this.os, this.asm);
        this.ctx = new CompileContext("main");

        // 库管理器
        this.libManager = new LibraryManager();

        // 待处理的函数表达式
        this.pendingFunctions = [];
        this.labelCounter = 0;

        // 输出配置
        this.outputType = "executable";
        this.exports = [];
        this.libraries = [];
        this.libraryPaths = [];
        this.sourcePath = "";
        this.options = {}; // 编译选项

        // 兼容旧 API
        this.externalLibs = this.libManager.externalLibs;
        this.staticLibs = [];
        this.registeredDylibs = this.libManager.registeredDylibs;
    }

    _initAssembler() {
        if (this.arch === "arm64") {
            this.asm = new ARM64Assembler();
        } else {
            this.asm = new X64Assembler();
        }
    }

    // ========== 配置方法 ==========

    setSourcePath(sourcePath) {
        this.sourcePath = path.dirname(sourcePath);
    }

    setOutputType(type) {
        this.outputType = type;
    }

    addExport(name) {
        this.exports.push(name);
    }

    addLibrary(name) {
        this.libraries.push(name);
    }

    addLibraryPath(p) {
        this.libraryPaths.push(p);
    }

    setOption(key, value) {
        this.options[key] = value;
    }

    getOption(key) {
        return this.options[key];
    }

    addExternalLib(libInfo) {
        this.libManager.addExternalLib(libInfo);
    }

    addStaticLib(libInfo) {
        this.staticLibs.push(libInfo);
    }

    // ========== 库处理 ==========

    compileImportLibDeclaration(stmt) {
        let jslibPath = stmt.libPath;
        let libInfo = parseJslibFile(jslibPath, this.sourcePath, this.target);
        if (libInfo) {
            if (!this.libManager.isLibraryLoaded(libInfo.fullPath, libInfo.type)) {
                if (libInfo.type === "static") {
                    this.addStaticLib(libInfo);
                    console.log("Loaded static library: " + libInfo.name);
                } else {
                    this.addExternalLib(libInfo);
                    console.log("Loaded shared library: " + libInfo.name);
                }
                console.log("  Path: " + libInfo.fullPath);
                console.log("  Symbols: " + libInfo.symbols.join(", "));
            }
        }
    }

    isExternalSymbol(name) {
        // 检查动态库
        if (this.libManager.isExternalSymbol(name)) return true;
        // 检查静态库
        for (const lib of this.staticLibs) {
            if (lib.symbols && lib.symbols.includes(name)) {
                return true;
            }
        }
        return false;
    }

    getExternalLibInfo(name) {
        const lib = this.libManager.getLibraryForSymbol(name);
        if (lib) return lib;
        // 检查静态库
        for (const lib of this.staticLibs) {
            if (lib.symbols && lib.symbols.includes(name)) {
                return lib;
            }
        }
        return null;
    }

    registerExternalLib(libInfo) {
        this.libManager.registerDylib(libInfo.fullPath);
    }

    getDylibIndex(dylibPath) {
        return this.libManager.getDylibIndex(dylibPath);
    }

    // ========== 编译流程 ==========

    nextLabelId() {
        return this.labelCounter++;
    }

    parse(source) {
        const lexer = new Lexer(source);
        const parser = new Parser(lexer);
        return parser.parseProgram();
    }

    compile(source) {
        const ast = this.parse(source);

        if (this.outputType === "shared" || this.outputType === "static") {
            this.generateSharedLibraryRuntime();
            this.compileProgramForLibrary(ast);
        } else {
            this.generateEntry();
            this.generateRuntime();
            this.compileProgram(ast);

            if (this.staticLibs && this.staticLibs.length > 0) {
                this.embedStaticLibraries();
            }
        }

        return this.generateExecutable();
    }

    compileFile(inputFile, outputFile) {
        const source = fs.readFileSync(inputFile, "utf-8");

        if (!outputFile) {
            const baseName = path.basename(inputFile, ".js");
            outputFile = baseName + Targets[this.target].ext;
        }

        this.outputFileName = outputFile;
        const result = this.compile(source);

        if (result && result.type === "static") {
            const writeResult = this.writeStaticLibrary(result.objectData, outputFile);
            // 生成 jslib 声明文件 (除非禁用)
            if (!this.options.noJslib) {
                this.generateJslibFile(outputFile, "static");
            }
            return writeResult;
        }

        const binary = result;
        fs.writeFileSync(outputFile, Buffer.from(binary));
        fs.chmodSync(outputFile, 0o755);

        // 生成 jslib 声明文件 (仅共享库，除非禁用)
        if (this.outputType === "shared" && !this.options.noJslib) {
            this.generateJslibFile(outputFile, "shared");
        }

        return { output: outputFile, size: binary.length };
    }

    // 生成 .jslib 声明文件
    generateJslibFile(outputFile, libType) {
        const baseName = path.basename(outputFile);
        const dirName = path.dirname(outputFile);
        // 去掉 lib 前缀和扩展名得到基础名
        let libName = baseName.replace(/^lib/, "").replace(/\.(dylib|so|dll|a|lib)$/, "");
        const jslibPath = path.join(dirName, libName + ".jslib");

        // 获取导出的函数列表
        const exportFuncs = this.exports.length > 0 ? this.exports : Object.keys(this.ctx.functions);

        const lines = [];
        lines.push(`// ${libName}.jslib - 库声明文件`);
        lines.push(`// 由 jsbin 自动生成`);
        lines.push(`// 用法: import * from "./${libName}.jslib"`);
        lines.push("");
        lines.push("// 库配置");
        lines.push(`export const __lib__ = {`);
        lines.push(`    path: "./${libName}",`);
        if (libType === "static") {
            lines.push(`    type: "static",`);
        }
        lines.push(`};`);
        lines.push("");
        lines.push("// 导出函数声明");
        for (const name of exportFuncs) {
            lines.push(`export function ${name}();`);
        }
        lines.push("");

        fs.writeFileSync(jslibPath, lines.join("\n"));
        console.log(`Generated: ${jslibPath}`);
    }

    // ========== 运行时生成 ==========

    generateRuntime() {
        const allocGen = new AllocatorGenerator(this.vm);
        allocGen.generate();
        const runtimeGen = new RuntimeGenerator(this.vm, this.ctx);
        runtimeGen.generate();
        this.generateDataSection();
    }

    generateDataSection() {
        const numberGen = new NumberGenerator(this.vm, this.ctx);
        numberGen.generateDataSection(this.asm);
    }

    generateSharedLibraryRuntime() {
        // 共享库不需要完整运行时
    }

    // ========== 入口点和程序编译 ==========

    generateEntry() {
        const vm = this.vm;
        vm.label("_start");
        vm.prologue(0, []);
        vm.call("_heap_init");
        vm.call("_scheduler_init");
        vm.call("_main");
        vm.call("_scheduler_run");
        vm.movImm(VReg.A0, 0);
        if (this.os === "windows") {
            vm.callWindowsExitProcess();
        } else if (this.arch === "arm64") {
            vm.syscall(this.os === "linux" ? 93 : 1);
        } else {
            vm.syscall(this.os === "linux" ? 60 : 0x2000001);
        }
    }

    compileProgram(ast) {
        const vm = this.vm;
        this.collectFunctions(ast);

        const mainBoxedVars = analyzeTopLevelSharedVariables(ast);
        const mainFunc = {
            params: [],
            body: {
                type: "BlockStatement",
                body: ast.body.filter((stmt) => stmt.type !== "FunctionDeclaration"),
            },
        };
        const innerBoxedVars = analyzeSharedVariables(mainFunc);

        for (const v of innerBoxedVars) {
            mainBoxedVars.add(v);
        }

        this.ctx.boxedVars = mainBoxedVars;

        const topLevelCapturedVars = analyzeTopLevelSharedVariables(ast);
        for (const name of topLevelCapturedVars) {
            const label = this.ctx.allocMainCapturedVar(name);
            this.asm.addDataLabel(label);
            this.asm.addDataQword(0);
        }

        vm.label("_main");
        // 分配较大的栈空间以容纳动态分配的局部变量（如数组方法的临时变量）
        vm.prologue(512, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);
        this.ctx.returnLabel = "_main_return";

        for (const stmt of ast.body) {
            if (stmt.type !== "FunctionDeclaration") {
                this.compileStatement(stmt);
            }
        }

        vm.movImm(VReg.RET, 0);
        vm.label("_main_return");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 512);

        this.compileUserFunctions();
        this.generatePendingFunctions();
    }

    compileProgramForLibrary(ast) {
        this.collectFunctions(ast);
        this.compileUserFunctions();
        this.generatePendingFunctions();

        // 生成 C 调用约定包装器
        const wrapperGen = new WrapperGenerator(this);
        wrapperGen.generate(this.exports);
    }

    collectFunctions(ast) {
        for (const stmt of ast.body) {
            if (stmt.type === "FunctionDeclaration" && stmt.id) {
                this.ctx.registerFunction(stmt.id.name, stmt);
            } else if (stmt.type === "ExportDeclaration" && stmt.declaration) {
                const decl = stmt.declaration;
                if (decl.type === "FunctionDeclaration" && decl.id) {
                    this.ctx.registerFunction(decl.id.name, decl);
                    if (!this.exports.includes(decl.id.name)) {
                        this.exports.push(decl.id.name);
                    }
                }
            }
        }
    }

    compileUserFunctions() {
        for (const name in this.ctx.functions) {
            this.compileFunction(name, this.ctx.functions[name]);
        }
    }

    compileFunction(name, func) {
        const vm = this.vm;
        const funcLabel = "_user_" + name;
        const returnLabel = funcLabel + "_return";

        const isAsync = isAsyncFunction(func);

        const savedCtx = this.ctx;
        this.ctx = savedCtx.clone(name);
        this.ctx.returnLabel = returnLabel;
        this.ctx.inAsyncFunction = isAsync;

        const boxedVars = analyzeSharedVariables(func);
        this.ctx.boxedVars = boxedVars;

        vm.label(funcLabel);
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        const params = func.params || [];
        const paramOffsets = [];
        for (let i = 0; i < params.length && i < 6; i++) {
            const param = params[i];
            if (param.type === "Identifier") {
                const paramName = param.name;
                const offset = this.ctx.allocLocal(paramName);
                paramOffsets.push({ name: paramName, offset: offset });
                vm.store(VReg.FP, offset, vm.getArgReg(i));
            }
        }

        for (let i = 0; i < paramOffsets.length; i++) {
            const param = paramOffsets[i];
            if (boxedVars.has(param.name)) {
                vm.load(VReg.V1, VReg.FP, param.offset);
                vm.push(VReg.V1);
                vm.movImm(VReg.A0, 8);
                vm.call("_alloc");
                vm.store(VReg.FP, param.offset, VReg.RET);
                vm.pop(VReg.V1);
                vm.store(VReg.RET, 0, VReg.V1);
            }
        }

        if (func.body) {
            if (func.body.type === "BlockStatement") {
                for (const stmt of func.body.body) {
                    this.compileStatement(stmt);
                }
            } else {
                this.compileExpression(func.body);
            }
        }

        vm.movImm(VReg.RET, 0);
        vm.label(returnLabel);
        if (isAsync) {
            this.emitAsyncResolveAndReturnFromRet();
        } else {
            vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 64);
        }

        this.generatePendingFunctions();
        this.ctx = savedCtx;
    }

    // ========== 静态库支持 ==========

    embedStaticLibraries() {
        const linker = new StaticLinker();

        for (const lib of this.staticLibs) {
            linker.loadLibrary(lib.fullPath);
        }

        const linked = linker.getLinkedCode();
        const staticCodeBase = this.asm.code.length;

        for (let i = 0; i < linked.code.length; i++) {
            this.asm.code.push(linked.code[i]);
        }

        const dataArray = this.asm.data || this.asm.dataSection;
        if (dataArray && linked.data.length > 0) {
            for (let i = 0; i < linked.data.length; i++) {
                dataArray.push(linked.data[i]);
            }
        }

        for (const [name, offset] of Object.entries(linked.symbols)) {
            const finalOffset = staticCodeBase + offset;
            this.asm.labels[name] = finalOffset;
            if (!name.startsWith("_")) {
                this.asm.labels["_" + name] = finalOffset;
            }
        }
    }

    writeStaticLibrary(objectData, outputFile) {
        const tempDir = os.tmpdir();
        const baseName = path.basename(outputFile, ".a");
        const tempObjFile = path.join(tempDir, baseName + ".o");

        try {
            fs.writeFileSync(tempObjFile, Buffer.from(objectData));
            execSync(`ar rcs "${outputFile}" "${tempObjFile}"`, { stdio: "pipe" });
            const stats = fs.statSync(outputFile);
            return { output: outputFile, size: stats.size };
        } finally {
            try {
                fs.unlinkSync(tempObjFile);
            } catch (e) {}
        }
    }

    // ========== 二进制生成 ==========

    generateExecutable() {
        const allocGen = new AllocatorGenerator(this.vm);
        allocGen.generateDataSection(this.asm);

        // 生成异步运行时数据段（调度器全局变量）
        const asyncGen = new AsyncGenerator(this.vm);
        asyncGen.generateDataSection(this.asm);

        this.asm.finalize();

        const generator = new BinaryOutputGenerator(this);

        if (this.outputType === "shared") {
            return generator.generateSharedLibrary();
        } else if (this.outputType === "object") {
            return generator.generateObjectFile();
        } else if (this.outputType === "static") {
            return generator.generateStaticLibrary();
        }

        return generator.generateExecutable();
    }

    // ========== C 调用约定参数编译 ==========

    compileCallArgumentsForCConvention(args) {
        const vm = this.vm;
        const paramCount = Math.min(args.length, 8);
        const tempOffsets = [];

        for (let i = 0; i < paramCount; i++) {
            this.compileExpression(args[i]);
            const tempName = `__temp_arg_${i}_${this.nextLabelId()}`;
            const offset = this.ctx.allocLocal(tempName);
            tempOffsets.push(offset);
            vm.store(VReg.FP, offset, VReg.RET);
        }

        if (this.arch === "arm64") {
            for (let i = 0; i < paramCount; i++) {
                vm.load(VReg.RET, VReg.FP, tempOffsets[i]);
                this.asm.fmovToFloat(i, 0);
            }
        } else {
            for (let i = 0; i < paramCount; i++) {
                vm.load(VReg.RET, VReg.FP, tempOffsets[i]);
                this.asm.movqToXmm(i, 0);
            }
        }
    }

    // 兼容旧 API
    generateCCallingWrappers() {
        const wrapperGen = new WrapperGenerator(this);
        wrapperGen.generateARM64Wrappers(this.exports);
    }

    generateCCallingWrappersX64() {
        const wrapperGen = new WrapperGenerator(this);
        wrapperGen.generateX64Wrappers(this.exports);
    }

    // 添加字符串常量到数据段，返回标签名
    addStringConstant(str) {
        return this.asm.addString(str);
    }
}

// 混入编译器模块的方法
Object.assign(Compiler.prototype, StatementCompiler);
Object.assign(Compiler.prototype, ExpressionCompiler);
Object.assign(Compiler.prototype, FunctionCompiler);

// ========== 简化接口 ==========

export function compileFile(inputFile, outputFile, target) {
    target = target || detectPlatform();
    const compiler = new Compiler(target);
    return compiler.compileFile(inputFile, outputFile);
}

export function parseSource(source) {
    const lexer = new Lexer(source);
    const parser = new Parser(lexer);
    return parser.parseProgram();
}

export function parseFile(inputFile) {
    const source = fs.readFileSync(inputFile, "utf-8");
    return parseSource(source);
}

export function createCompiler(target, options) {
    return new Compiler(target, options);
}
