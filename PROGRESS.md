# JSBin JavaScript 编译器

## 项目概述

JSBin 是一个将 JavaScript 编译为原生机器码的 AOT (Ahead-of-Time) 编译器，支持多平台输出。

| 类别 | 完成度 | 说明 |
|------|--------|------|
| 语法分析 | 85% | ES6+ 语法解析，支持类、箭头函数、模板字符串、解构等 |
| 类型系统 | 50% | 静态类型推断，内置类型识别与跟踪 |
| 运行时 | 80% | Array/Map/Set/Date/RegExp/Promise/TypedArray，GC 完成 |
| 代码生成 | 80% | macOS/Linux/Windows，ARM64/x64 |
| 异步支持 | 80% | async/await，协程调度器，Promise 基础 |
| 优化器 | 15% | 基础常量折叠，闭包变量分析 |

---

## 项目架构

```
jsbin/
├── lang/                       # 语言前端
│   ├── lexer/                  # 词法分析 (80+ Token 类型)
│   ├── parser/                 # Pratt Parser (50+ AST 节点)
│   └── analysis/               # 语义分析 (闭包变量分析)
│
├── vm/                         # 虚拟机层
│   ├── index.js                # VirtualMachine 主类
│   ├── registers.js            # 虚拟寄存器 (V0-V7, S0-S3, A0-A5)
│   └── instructions.js         # 虚拟指令集
│
├── backend/                    # 后端代码生成
│   ├── arm64.js                # ARM64 后端
│   └── x64.js                  # x64 后端 (System V / Windows ABI)
│
├── asm/                        # 汇编器
│   ├── arm64.js                # ARM64 指令编码
│   └── x64.js                  # x64 指令编码 (REX, ModRM/SIB)
│
├── binary/                     # 二进制格式生成
│   ├── macho_*.js              # Mach-O (macOS)
│   ├── elf*.js                 # ELF (Linux)
│   ├── pe*.js                  # PE (Windows)
│   └── static_linker.js        # 静态链接器
│
├── compiler/                   # 编译器核心
│   ├── index.js                # 编译入口
│   ├── core/                   # 核心模块
│   │   ├── context.js          # 编译上下文
│   │   ├── platform.js         # 平台配置
│   │   └── types.js            # 类型系统
│   ├── expressions/            # 表达式编译
│   │   ├── literals.js         # 字面量
│   │   ├── operators.js        # 运算符
│   │   ├── assignments.js      # 赋值
│   │   └── members.js          # 成员访问
│   ├── functions/              # 函数编译
│   │   ├── builtin_methods.js  # 内置方法
│   │   ├── data_structures.js  # 数据结构
│   │   └── closures.js         # 闭包
│   ├── async/                  # 异步编译
│   │   ├── index.js            # async 语句编译
│   │   └── async.js            # async 函数/调用编译
│   └── output/                 # 输出生成
│       ├── library.js          # 库管理
│       ├── wrapper.js          # C ABI 包装
│       └── generator.js        # 二进制生成
│
├── runtime/                    # 运行时库
│   ├── index.js                # RuntimeGenerator 入口
│   ├── core/                   # 核心运行时
│   │   ├── allocator.js        # 内存分配 (bump allocator)
│   │   ├── print.js            # PrintGenerator
│   │   └── strings.js          # 字符串常量
│   ├── types/                  # 类型实现 (每类型独立目录)
│   │   ├── number/             # NumberGenerator (Int + Float)
│   │   ├── string/             # StringGenerator
│   │   ├── array/              # ArrayGenerator
│   │   ├── object/             # ObjectGenerator
│   │   ├── map/                # MapGenerator
│   │   ├── set/                # SetGenerator
│   │   ├── date/               # DateGenerator
│   │   ├── regexp/             # RegExpGenerator
│   │   └── typedarray/         # TypedArrayGenerator (8种类型)
│   ├── async/                  # 异步运行时
│   │   ├── coroutine.js        # 协程调度器
│   │   └── promise.js          # Promise 实现
│   └── operators/              # 运算符
│       └── typeof.js           # TypeofGenerator
│
└── cli.js                      # 命令行接口
```

### 命名规范

所有运行时生成器统一为 `{Type}Generator` 类格式：

```javascript
class {Type}Generator {
    constructor(vm, backend = null) {
        this.vm = vm;
        this.backend = backend;
    }
    generate() { /* 生成运行时函数 */ }
}
```

---

## 平台支持

| 平台 | 架构 | 可执行 | 动态库 | 静态库 |
|------|------|--------|--------|--------|
| macOS | ARM64 | ✅ Mach-O | ✅ .dylib | ✅ .a |
| macOS | x64 | ✅ Mach-O | ✅ .dylib | ✅ .a |
| Linux | ARM64 | ✅ ELF64 | ✅ .so | ✅ .a |
| Linux | x64 | ✅ ELF64 | ✅ .so | ✅ .a |
| Windows | x64 | ✅ PE64 | ✅ .dll | ✅ .a |

---

## ECMAScript 版本支持

| 版本 | 特性 | 状态 |
|------|------|------|
| ES5 | 基础语法、函数、数组、对象、异常处理 | ✅ 完整 |
| ES6 | 箭头函数、类、模板字符串、let/const、解构、展开、for-of | ✅ 大部分 |
| ES7 | Array.includes、指数运算符 | ✅ 完整 |
| ES8 | async/await、Object.entries/values | ✅ async/await |
| ES9 | 异步迭代、对象展开、Promise.finally | 🔶 部分 |
| ES10 | Array.flat、Object.fromEntries、String.trim | ❌ 未实现 |
| ES11 | 可选链 ?.、空值合并 ??、BigInt | ✅ ?./?? |
| ES12 | 逻辑赋值、数字分隔符、Promise.any | ✅ 逻辑赋值 |
| ES13 | at() 方法、私有字段 | 🔶 at() |
| ES14+ | 装饰器、迭代器助手 | ❌ 未实现 |

---

## 已实现功能

### 值类型系统
- [x] 类型标签系统 (INT, FLOAT, STRING, BOOLEAN, NULL, UNDEFINED, ARRAY, OBJECT, FUNCTION, DATE, MAP, SET, REGEXP)
- [x] IEEE 754 double 统一表示 (支持 NaN, ±0, ±Infinity)
- [x] typeof/instanceof 运算符
- [x] 统一对象头部结构
- [ ] 隐藏类 (hidden class)

#### 统一对象头部结构

所有堆分配的复合类型数据都使用统一的头部格式：

```
┌────────────────────────────────────────────────────────┐
│  +0: type (8 bytes)                                    │
│      └─ 低 8 位: 类型标记 (TYPE_*)                      │
│      └─ 高位: 预留标志位 (GC标记、不可变标记等)          │
├────────────────────────────────────────────────────────┤
│  +8: length (8 bytes)                                  │
│      └─ 字符串: 字节长度                               │
│      └─ 数组/Map/Set: 元素数量                         │
│      └─ 对象: 属性数量                                 │
├────────────────────────────────────────────────────────┤
│  +16: content (变长)                                   │
│      └─ 字符串: UTF-8 字节 + null 终止符               │
│      └─ 数组: 元素值 (每个 8 字节)                     │
│      └─ 对象: 属性对 (key指针 + value, 各 8 字节)       │
└────────────────────────────────────────────────────────┘
```

**类型标记常量:**
| 常量 | 值 | 说明 |
|------|------|------|
| TYPE_RAW | 0 | 原始数据 |
| TYPE_ARRAY | 1 | 数组 |
| TYPE_OBJECT | 2 | 对象 |
| TYPE_CLOSURE | 3 | 闭包 |
| TYPE_MAP | 4 | Map |
| TYPE_SET | 5 | Set |
| TYPE_STRING | 6 | 字符串 |
| TYPE_DATE | 7 | Date |
| TYPE_REGEXP | 8 | RegExp |
| TYPE_GENERATOR | 9 | Generator |
| TYPE_COROUTINE | 10 | Coroutine |
| TYPE_PROMISE | 11 | Promise |
| TYPE_NUMBER | 13 | Boxed Number |
| TYPE_INT8_ARRAY | 0x40 | Int8Array |
| TYPE_INT16_ARRAY | 0x41 | Int16Array |
| TYPE_INT32_ARRAY | 0x42 | Int32Array |
| TYPE_UINT8_ARRAY | 0x50 | Uint8Array |
| TYPE_UINT8_CLAMPED | 0x54 | Uint8ClampedArray |
| TYPE_UINT16_ARRAY | 0x51 | Uint16Array |
| TYPE_UINT32_ARRAY | 0x52 | Uint32Array |
| TYPE_FLOAT32_ARRAY | 0x60 | Float32Array |
| TYPE_FLOAT64_ARRAY | 0x61 | Float64Array |

**Number 子类型常量:**
| 常量 | 值 | 大小 | 说明 |
|------|------|------|------|
| NUM_INT8 | 0x10 | 1B | 有符号 8 位整数 |
| NUM_INT16 | 0x11 | 2B | 有符号 16 位整数 |
| NUM_INT32 | 0x12 | 4B | 有符号 32 位整数 |
| NUM_INT64 | 0x13 | 8B | 有符号 64 位整数 (默认) |
| NUM_UINT8 | 0x20 | 1B | 无符号 8 位整数 |
| NUM_UINT16 | 0x21 | 2B | 无符号 16 位整数 |
| NUM_UINT32 | 0x22 | 4B | 无符号 32 位整数 |
| NUM_UINT64 | 0x23 | 8B | 无符号 64 位整数 |
| NUM_FLOAT16 | 0x30 | 2B | 半精度浮点 |
| NUM_FLOAT32 | 0x31 | 4B | 单精度浮点 |
| NUM_FLOAT64 | 0x32 | 8B | 双精度浮点 (默认) |

**优势:**
- 运行时可通过头部快速识别数据类型
- length 字段支持 O(1) 获取长度
- GC 可通过类型决定如何遍历引用
- 便于调试和内存分析

### 数字处理
- [x] 数字分隔符 `1_000_000`
- [x] 十六进制/八进制/二进制 (0x/0o/0b)
- [x] 科学计数法 (e/E)

### 字符串与数组
- [x] 字符串: strlen, strcmp, strcpy, strstr, strcat, strconcat
- [x] 字符串连接运算符 `+` (自动类型转换)
- [x] 字符串方法: toUpperCase, toLowerCase, charAt, charCodeAt, trim, slice, substring, indexOf, concat
- [x] 堆字符串类型头 (TYPE_STRING=6, 16字节头部 + 内容)
- [x] `_getStrContent` 自动识别堆/数据段字符串
- [x] `_str_length` 统一获取字符串长度 (堆: 读 +8, 数据段: strlen)
- [ ] 字符串方法: startsWith, endsWith, includes, repeat, split, replace
- [x] 数组: push, pop, get, set, at, includes, indexOf, slice, length
- [x] 数组动态扩容 (push 超过容量时自动 2x 扩容)
- [x] 数组 indexOf/includes 支持 Number 对象值比较
- [x] 数组布局: [type(8), length(8), capacity(8), elements...]
- [x] TypedArray: Int8/Uint8/Int16/Uint16/Int32/Uint32/Float32/Float64Array
  - new TypedArray(length)
  - 元素读写 arr[i], arr[i] = value
  - console.log 打印支持
- [ ] Unicode 感知操作
- [ ] 排序算法 (TimSort)

### 集合类型
- [x] Map: new, set, get, has, delete, clear, size
- [x] Set: add, has, delete, clear, size
- [ ] 哈希表优化 (O(1) 访问)
- [ ] WeakMap/WeakSet

### 日期与正则
- [x] Date.now(), new Date(), getTime()
- [x] Date.toString(), toISOString() (ISO 8601 格式)
- [x] RegExp: new, test() (子字符串匹配)
- [x] getTimezoneOffset() (基础实现)
- [ ] 完整时区处理 (本地时间方法 getHours/getMinutes 等)
- [ ] 正则引擎 (NFA/DFA)

### ES6+ 语法
- [x] 箭头函数
- [x] 无括号单参数箭头函数 `x => x * 2`
- [x] 模板字符串 `` `Hello, ${name}!` `` (多插值、表达式、多行)
- [x] 模板字符串中对象属性多插值 `${obj.prop}`
- [x] 展开语法 `...`
- [x] 可选链 `?.`
- [x] 空值合并 `??`
- [x] 逻辑赋值 `&&=` `||=` `??=`
- [x] 默认参数
- [x] 计算属性名 `{ [expr]: value }`
- [x] for...of / for...in
- [x] 类声明 (class, extends, constructor)
- [ ] 私有字段 `#field`

### 闭包
- [x] 捕获变量分析
- [x] 闭包对象生成 (魔数 0xC105)
- [x] Box 包装共享变量
- [x] 嵌套闭包

### 异步编程 (async/await)
- [x] async 函数声明
- [x] async 箭头函数
- [x] await 表达式
- [x] Promise 基础 (new, then, resolve, reject)
- [x] 协程调度器 (多协程并发)
- [x] try/catch 异步异常处理
- [ ] Promise.all/race/allSettled/any

### 异常处理
- [x] try/catch/finally 语法解析
- [x] 可选 catch 绑定
- [ ] 错误堆栈追踪
- [ ] Error.cause

---

## 待实现功能

### P0 - 近期优化
- [x] Date ISO 格式打印 (2026-01-14T05:00:42.588Z)
- [x] Float 打印优化 (14.00000 → 14, 14.13000 → 14.13)
- [x] Number 子类型系统设计 (types.js):
  - NUM_INT8/16/32/64 (有符号整数)
  - NUM_UINT8/16/32/64 (无符号整数)
  - NUM_FLOAT16/32/64 (浮点数, Float64 = 默认)
- [x] TypedArray 完整实现 (8 种类型全部支持)
  - Int8Array, Uint8Array, Int16Array, Uint16Array
  - Int32Array, Uint32Array, Float32Array, Float64Array
- [x] jslib 生成控制 (--no-jslib 参数)
- [x] async/await 支持 (协程调度器 + CPS 变换)

### P1 - 高优先级
- [ ] Symbol 类型
- [ ] 迭代器协议 (@@iterator)
- [ ] Promise 高级组合 (all, race, allSettled, any)
- [ ] JSON.parse/stringify
- [ ] Math 对象方法

### P2 - 中优先级
- [ ] 生成器 (Generator)
- [ ] 异步生成器 (async generator)
- [ ] 私有字段和方法
- [ ] Proxy/Reflect
- [ ] 装饰器
- [ ] 模块系统 (import/export)

### P3 - 优化
- [ ] 常量折叠和传播
- [ ] 无用代码消除 (DCE)
- [ ] 函数内联
- [ ] 内联缓存 (IC)
- [ ] 分代 GC
- [ ] Source Map

---

## 技术实现细节

### 虚拟指令集
```
数据移动: MOV, MOV_IMM, LOAD, STORE
算术运算: ADD, SUB, MUL, DIV, MOD
位运算:   AND, OR, XOR, SHL, SHR, SAR, NOT
比较跳转: CMP, JEQ, JNE, JLT, JLE, JGT, JGE
函数调用: CALL, RET, PROLOGUE, EPILOGUE
浮点运算: FADD, FSUB, FMUL, FDIV, F2I, I2F
```

### 虚拟寄存器
```
通用: V0-V7
保存: S0-S3
参数: A0-A5
特殊: RET, FP, SP
```

### 内存布局
```
数组:       [type: 8B][length: 8B][capacity: 8B][elem0: 8B][elem1: 8B]...
TypedArray: [type: 8B][length: 8B][data...]  (元素大小按类型: 1/2/4/8B)
闭包:       [magic: 2B][padding: 6B][func_ptr: 8B][captured...]
Date:       [type: 8B][timestamp: 8B]
RegExp:     [type: 8B][pattern_ptr: 8B][flags: 8B][lastIndex: 8B]
Promise:    [type: 8B][status: 8B][value: 8B][then_handlers: 8B][catch_handlers: 8B][coroutine: 8B]
Coroutine:  [type: 8B][status: 8B][stack_base: 8B][stack_size: 8B][saved_sp: 8B][saved_fp: 8B][saved_lr: 8B][func_ptr: 8B][arg: 8B][result: 8B][next: 8B][promise: 8B][closure_ptr: 8B]
```

### 系统调用
| 功能 | macOS | Linux | Windows |
|------|-------|-------|---------|
| 写入 | write (0x2000004) | write (1) | WriteConsoleA |
| 退出 | exit (0x2000001) | exit (60) | ExitProcess |
| 内存 | mmap (0x20000C5) | mmap (9) | VirtualAlloc |
| 时间 | gettimeofday | clock_gettime | GetSystemTimeAsFileTime |

---

## 开发命令

```bash
# 编译并运行
node cli.js input.js -o output && ./output

# 指定平台
node cli.js input.js -o output --target linux-x64

# 生成动态库
node cli.js input.js -o libout.dylib --shared --export myFunc

# 生成静态库
node cli.js input.js -o libout.a --static
```

---

## 更新日志

### 2026-01-15
- **TypedArray 完整实现**
  - 8 种 TypedArray 类型: Int8/Uint8/Int16/Uint16/Int32/Uint32/Float32/Float64Array
  - `new TypedArray(length)` 构造函数
  - 元素读取 `arr[i]` 和写入 `arr[i] = value`
  - console.log 多参数支持 `console.log("label:", typedArray)`
  - 统一的 `_subscript_get/_subscript_set` 处理 Array 和 TypedArray
  - Boxed Number 自动 unbox 到 TypedArray 元素

- **ARM64 后端偏移修复**
  - 修复 STUR/LDUR 指令 9 位有符号偏移限制 (-256 到 +255)
  - 超出范围的偏移使用 ADD/SUB + STR/LDR 组合
  - 修复临时变量累积导致的栈偏移超限 bug

- **console.log 多参数支持**
  - 支持任意数量参数 `console.log(a, b, c, ...)`
  - 参数间自动添加空格分隔
  - `_print_value_no_nl` 处理 Boxed Number (TYPE_NUMBER=13) 和 TypedArray

- **字符串方法修复与完善**
  - `charAt(index)`: 修复浮点索引转整数顺序错误
  - `charCodeAt(index)`: 添加浮点转整数、调用 `_getStrContent`
  - `slice(start, end)`: 修复 `cmpImm` 不支持负数比较问题，使用寄存器比较
  - `_str_charAt` / `_str_charCodeAt`: 调用 `_getStrContent` 获取内容指针

- **字符串连接与模板字符串**
  - 字符串 `+` 运算符: 支持字符串与变量连接、链式连接
  - `_strconcat`: 带类型标记的堆字符串分配
  - `_getStrContent`: 统一处理数据段字符串和堆字符串
  - 模板字符串词法分析: TEMPLATE_HEAD/MIDDLE/TAIL 三种 Token
  - 模板字符串解析: `templateDepth` 跟踪嵌套 `${}`
  - 模板字符串编译: quasis + expressions 交替连接
  - 类型转换: `_intToStr`, `_boolToStr` 用于插值

- **字符串综合测试通过**
  - length 属性 (字符串/数组/字面量)
  - charAt/charCodeAt (数据段和堆字符串)
  - 字符串连接 (+多重连接)
  - toUpperCase/toLowerCase
  - trim (空格/制表符)
  - slice (单参数/双参数)

### 2026-01-15 (晚)

- **TypedArray 继承 Array 方法**
  - `forEach`: 支持 TypedArray 遍历
  - `map`: 支持 TypedArray，返回同类型 TypedArray
  - `filter`: 支持 TypedArray，动态调整结果数组大小
  - `reduce`: 支持 TypedArray，含/不含初始值两种形式

- **Number 打印系统修复**
  - **寄存器别名 Bug**: `VReg.V0/A0/RET` 都映射到 X0
    - `_print_number`: 使用 S1 保存类型，避免被 A0 覆盖
    - `_print_float`: 使用 S2 保存 fcvtzs 结果，避免打印负号时被覆盖
  - **TYPE_NUMBER 类型路由**: TYPE_NUMBER=13 内部存储 float64，需走浮点路径
    - 修正逻辑: type==13 或 type>=28 走浮点，type∈[20,27] 走整数

- **统一类型推断**
  - `inferType()` 对所有数字字面量返回 `Type.NUMBER`
  - 避免 INT64/FLOAT64 与 NUMBER 对象混用导致比较失败

- **TypedArray.length 修复**
  - 返回 Number 对象而非原始整数
  - 添加 SCVTF 指令将整数转换为浮点后装箱

- **f2i 指令添加**
  - VM: `f2i(dest, src)` 从 Number 对象提取整数
  - ARM64: 加载 float64 位 → FMOV → FCVTZS

### 2026-01-14 (下午)
- **async/await 完整实现**
  - 协程调度器 (coroutine.js): 创建、恢复、挂起、返回
  - Promise 运行时 (promise.js): new, then, resolve, reject, _promise_await
  - CPS 变换: async 函数编译为协程，await 编译为 yield + promise 等待
  - async 箭头函数支持
- **Bug 修复**
  - ARM64 addImm/subImm: 修复大立即数 (>4095) 被截断问题
  - 协程栈指针 16 字节对齐: 修复多协程 bus error
  - async 箭头函数解析: 修复 `async () =>` 语法
  - print 作为一等公民: 支持 `promise.then(print)`

### 2026-01-14
- 运行时生成器命名统一为 `{Type}Generator` 类格式
- 目录重组: runtime/types/ 下每个类型独立目录
- Number 类型包含 IntGenerator 和 FloatGenerator
- 编译器模块拆分 (index.js 1490→552 行)
- 修复: 数组索引浮点转整数、成员赋值、栈破坏

---

*最后更新: 2026-01-15 20:10*
