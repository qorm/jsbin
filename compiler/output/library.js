// JSBin 编译器 - 库文件解析模块
// 解析 .jslib 文件，处理动态库和静态库导入

import * as fs from "fs";
import * as path from "path";

// 根据平台构建动态库名称
export function buildDylibName(libName, target) {
    if (target.includes("macos")) {
        return "lib" + libName + ".dylib";
    } else if (target.includes("linux")) {
        return "lib" + libName + ".so";
    } else if (target.includes("windows")) {
        return libName + ".dll";
    }
    return "lib" + libName + ".dylib";
}

// 根据平台构建静态库名称
export function buildStaticLibName(libName, target) {
    return "lib" + libName + ".a";
}

// 解析 jslib 文件
export function parseJslibFile(jslibPath, basePath, target) {
    let fullPath = jslibPath;
    if (!path.isAbsolute(jslibPath) && basePath) {
        fullPath = path.join(basePath, jslibPath);
    }

    let content;
    try {
        content = fs.readFileSync(fullPath, "utf-8");
    } catch (e) {
        console.log("Warning: Cannot read jslib file: " + fullPath);
        return null;
    }

    let libInfo = {
        name: "",
        path: "",
        version: "1.0.0",
        symbols: [],
        fullPath: "",
        type: "shared",
    };

    // 解析 __lib__ 对象
    let libMatch = content.match(/__lib__\s*=\s*\{([\s\S]*?)\n\};/);
    if (libMatch) {
        let libContent = libMatch[1];
        let nameMatch = libContent.match(/name:\s*"([^"]+)"/);
        let versionMatch = libContent.match(/version:\s*"([^"]+)"/);
        let typeMatch = libContent.match(/type:\s*"([^"]+)"/);
        if (nameMatch) libInfo.name = nameMatch[1];
        if (versionMatch) libInfo.version = versionMatch[1];
        if (typeMatch) libInfo.type = typeMatch[1];

        // 检查 path 是字符串还是对象
        let pathStrMatch = libContent.match(/path:\s*"([^"]+)"/);
        let pathObjMatch = libContent.match(/path:\s*\{([^}]+)\}/);

        if (pathStrMatch) {
            libInfo.path = pathStrMatch[1];
        } else if (pathObjMatch) {
            let pathObjContent = pathObjMatch[1];
            let os = target.split("-")[0];
            let platformMatch = pathObjContent.match(new RegExp(os + ':\\s*"([^"]+)"'));
            if (platformMatch) {
                libInfo.path = platformMatch[1];
            }
        }
    }

    // 从 path 提取 name
    if (!libInfo.name && libInfo.path) {
        let baseName = path.basename(libInfo.path);
        if (baseName.startsWith("lib")) {
            baseName = baseName.substring(3);
        }
        let extIdx = baseName.lastIndexOf(".");
        if (extIdx > 0) {
            baseName = baseName.substring(0, extIdx);
        }
        libInfo.name = baseName;
    }

    // 解析 export function 声明
    let funcRegex = /export\s+function\s+(\w+)\s*\(/g;
    let match;
    while ((match = funcRegex.exec(content)) !== null) {
        libInfo.symbols.push(match[1]);
    }

    // 构建实际的库文件路径
    let jslibDir = path.dirname(fullPath);
    if (libInfo.path) {
        let libPath = libInfo.path;
        let libBasename = path.basename(libPath);

        let hasExt = libBasename.includes(".dylib") || libBasename.includes(".so") || libBasename.includes(".dll") || libBasename.includes(".a");

        if (!hasExt) {
            let libDir = path.dirname(libPath);
            let libName = libBasename;
            if (libName.startsWith("lib")) {
                libName = libName.substring(3);
            }
            let actualFileName;
            if (libInfo.type === "static") {
                actualFileName = buildStaticLibName(libName, target);
            } else {
                actualFileName = buildDylibName(libName, target);
            }
            libInfo.fullPath = path.join(jslibDir, libDir, actualFileName);
        } else {
            if (!path.isAbsolute(libPath)) {
                libInfo.fullPath = path.join(jslibDir, libPath);
            } else {
                libInfo.fullPath = libPath;
            }
        }
    }

    return libInfo;
}

// 库管理器类 - 管理外部库的加载和符号解析
export class LibraryManager {
    constructor() {
        this.externalLibs = []; // 动态库
        this.staticLibs = []; // 静态库
        this.registeredDylibs = []; // 已注册的 dylib 路径
    }

    // 添加外部动态库
    addExternalLib(libInfo) {
        this.externalLibs.push(libInfo);
    }

    // 添加静态库
    addStaticLib(libInfo) {
        this.staticLibs.push(libInfo);
    }

    // 检查符号是否来自外部库
    isExternalSymbol(name) {
        for (const lib of this.externalLibs) {
            if (lib.symbols && lib.symbols.includes(name)) {
                return true;
            }
        }
        for (const lib of this.staticLibs) {
            if (lib.symbols && lib.symbols.includes(name)) {
                return true;
            }
        }
        return false;
    }

    // 获取符号所属的库信息
    getLibraryForSymbol(name) {
        for (const lib of this.externalLibs) {
            if (lib.symbols && lib.symbols.includes(name)) {
                return lib;
            }
        }
        for (const lib of this.staticLibs) {
            if (lib.symbols && lib.symbols.includes(name)) {
                return lib;
            }
        }
        return null;
    }

    // 注册 dylib
    registerDylib(dylibPath) {
        if (!this.registeredDylibs.includes(dylibPath)) {
            this.registeredDylibs.push(dylibPath);
        }
    }

    // 获取 dylib 索引
    getDylibIndex(dylibPath) {
        const idx = this.registeredDylibs.indexOf(dylibPath);
        if (idx >= 0) {
            return idx + 2; // ordinal 从 2 开始（1 是 libSystem）
        }
        return 2;
    }

    // 检查是否已加载指定库
    isLibraryLoaded(fullPath, type) {
        const libs = type === "static" ? this.staticLibs : this.externalLibs;
        for (const lib of libs) {
            if (lib.fullPath === fullPath) {
                return true;
            }
        }
        return false;
    }
}
