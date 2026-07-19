// asm.js 编译器 - Map/Set/Date/RegExp 方法编译
// 编译 Map.set/get/has, Set.add/has, Date.getTime 等方法

import { VReg } from "../../vm/index.js";

// 集合类型方法编译 Mixin
export const CollectionMethodCompiler = {
    // 编译 Map 方法调用
    // obj.set(key, value), obj.get(key), obj.has(key), obj.delete(key), obj.size
    compileMapMethod(obj, method, args) {
        // 先编译 Map 对象
        this.compileExpression(obj);
        this.vm.push(VReg.RET); // 保存 Map 指针

        switch (method) {
            case "set":
                // map.set(key, value)
                if (args.length >= 2) {
                    this.compileExpression(args[1]);
                    this.vm.push(VReg.RET); // 保存 value
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET); // key
                    this.vm.pop(VReg.A2); // value
                    this.vm.pop(VReg.A0); // map
                    this.vm.call("_map_set");
                    return true;
                }
                break;

            case "get":
                // map.get(key)
                if (args.length >= 1) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET); // key
                    this.vm.pop(VReg.A0); // map
                    this.vm.call("_map_get");
                    return true;
                }
                break;

            case "has":
                // map.has(key)
                if (args.length >= 1) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET); // key
                    this.vm.pop(VReg.A0); // map
                    this.vm.call("_map_has");
                    return true;
                }
                break;

            case "delete":
                // map.delete(key)
                if (args.length >= 1) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET); // key
                    this.vm.pop(VReg.A0); // map
                    this.vm.call("_map_delete");
                    return true;
                }
                break;

            case "size":
                // map.size - 直接从头部读取 length 字段 (统一头部结构 +8)
                this.vm.pop(VReg.RET);
                this.vm.load(VReg.RET, VReg.RET, 8);
                return true;

            case "clear":
                // map.clear() - 走运行时（需同时重置 head/tail 并清零哈希桶数组）
                this.vm.pop(VReg.A0);
                this.vm.call("_map_clear");
                return true;
        }

        this.vm.pop(VReg.RET); // 恢复栈
        return false;
    },

    // 编译 Set 方法调用
    // obj.add(value), obj.has(value), obj.delete(value), obj.size
    compileSetMethod(obj, method, args) {
        // 先编译 Set 对象
        this.compileExpression(obj);
        this.vm.push(VReg.RET); // 保存 Set 指针

        switch (method) {
            case "add":
                // set.add(value)
                if (args.length >= 1) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET); // value
                    this.vm.pop(VReg.A0); // set
                    this.vm.call("_set_add");
                    return true;
                }
                break;

            case "has":
                // set.has(value)
                if (args.length >= 1) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET); // value
                    this.vm.pop(VReg.A0); // set
                    this.vm.call("_set_has");
                    return true;
                }
                break;

            case "delete":
                // set.delete(value)
                if (args.length >= 1) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET); // value
                    this.vm.pop(VReg.A0); // set
                    this.vm.call("_set_delete");
                    return true;
                }
                break;

            case "size":
                // set.size - 直接从头部读取 length 字段 (统一头部结构 +8)
                this.vm.pop(VReg.RET);
                this.vm.load(VReg.RET, VReg.RET, 8);
                return true;

            case "clear":
                // set.clear()
                this.vm.pop(VReg.A0);
                this.vm.call("_set_clear");
                return true;
        }

        this.vm.pop(VReg.RET); // 恢复栈
        return false;
    },

    // 编译 Date 方法调用
    // obj.getTime(), obj.toString(), obj.valueOf(), obj.toISOString()
    compileDateMethod(obj, method, args) {
        // 先编译 Date 对象
        this.compileExpression(obj);
        this.vm.mov(VReg.A0, VReg.RET);

        switch (method) {
            case "getTime":
            case "valueOf":
                // date.getTime() / date.valueOf()
                this.vm.call("_date_getTime");
                return true;

            case "toString":
                // date.toString()
                this.vm.call("_date_toString");
                return true;

            case "toISOString":
                // date.toISOString() - 输出 ISO 8601 格式
                this.vm.call("_date_toISOString");
                return true;

            // [#35] 历法 getter 家族(原先无分派无运行时,落通用路径崩溃)。
            // UTC 语义(与 Date(y,m,d) 构造自洽);part: 0=year,1=month(0基),
            // 2=day,3=hours,4=minutes,5=seconds,6=day-of-week
            case "getFullYear":
            case "getUTCFullYear":
                this.vm.movImm(VReg.A1, 0);
                this.vm.call("_date_get_part");
                this.boxIntAsNumber(VReg.RET);
                return true;
            case "getMonth":
            case "getUTCMonth":
                this.vm.movImm(VReg.A1, 1);
                this.vm.call("_date_get_part");
                this.boxIntAsNumber(VReg.RET);
                return true;
            case "getDate":
            case "getUTCDate":
                this.vm.movImm(VReg.A1, 2);
                this.vm.call("_date_get_part");
                this.boxIntAsNumber(VReg.RET);
                return true;
            case "getHours":
            case "getUTCHours":
                this.vm.movImm(VReg.A1, 3);
                this.vm.call("_date_get_part");
                this.boxIntAsNumber(VReg.RET);
                return true;
            case "getMinutes":
            case "getUTCMinutes":
                this.vm.movImm(VReg.A1, 4);
                this.vm.call("_date_get_part");
                this.boxIntAsNumber(VReg.RET);
                return true;
            case "getSeconds":
            case "getUTCSeconds":
                this.vm.movImm(VReg.A1, 5);
                this.vm.call("_date_get_part");
                this.boxIntAsNumber(VReg.RET);
                return true;
            case "getDay":
            case "getUTCDay":
                this.vm.movImm(VReg.A1, 6);
                this.vm.call("_date_get_part");
                this.boxIntAsNumber(VReg.RET);
                return true;
        }

        return false;
    },

    // 编译 RegExp 方法调用
    // obj.test(str), obj.exec(str)
    compileRegExpMethod(obj, method, args) {
        // 先编译 RegExp 对象
        this.compileExpression(obj);
        this.vm.push(VReg.RET); // 保存 regexp 对象

        // 编译参数（输入字符串）
        if (args.length > 0) {
            this.compileExpression(args[0]);
            this.vm.mov(VReg.A1, VReg.RET);
        } else {
            // 默认空字符串
            this.vm.lea(VReg.A1, "_str_empty");
        }

        // 恢复 regexp 对象到 A0
        this.vm.pop(VReg.A0);

        switch (method) {
            case "test":
                // regexp.test(str) - 返回布尔值
                this.vm.call("_regexp_test");
                return true;

            case "exec":
                // regexp.exec(str) - 返回结果数组或 null
                this.vm.call("_regexp_exec");
                return true;
        }

        return false;
    },
};
