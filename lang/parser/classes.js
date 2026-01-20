// JSBin 解析器 - 类解析
// 解析 class 声明、方法、私有字段等

import { TokenType } from "../lexer/token.js";
import * as AST from "./ast.js";
import { Precedence } from "./precedence.js";

// 类解析混入
export const ClassParser = {
    parseClassDeclaration() {
        this.nextToken();
        if (!this.curTokenIs(TokenType.IDENT)) return null;
        let id = new AST.Identifier(this.curToken.literal);
        let superClass = null;
        if (this.peekTokenIs(TokenType.EXTENDS)) {
            this.nextToken();
            this.nextToken();
            superClass = new AST.Identifier(this.curToken.literal);
        }
        if (!this.expectPeek(TokenType.LBRACE)) return null;
        let body = this.parseClassBody();
        return new AST.ClassDeclaration(id, superClass, body);
    },

    parseClassBody() {
        let body = [];
        this.nextToken();
        while (!this.curTokenIs(TokenType.RBRACE) && !this.curTokenIs(TokenType.EOF)) {
            let member = this.parseClassMember();
            if (member !== null) {
                body.push(member);
            }
            this.nextToken();
        }
        return body;
    },

    parseClassMember() {
        let isStatic = false;
        let isPrivate = false;

        // 检查 static 修饰符
        if (this.curTokenIs(TokenType.STATIC)) {
            isStatic = true;
            this.nextToken();
        }

        // 检查私有字段 (#name)
        if (this.curTokenIs(TokenType.HASH) || (this.curToken.literal && this.curToken.literal.startsWith("#"))) {
            return this.parsePrivateFieldOrMethod(isStatic);
        }

        // 检查 getter/setter
        let kind = "method";
        if (this.curTokenIs(TokenType.GET)) {
            // 检查是否真的是 getter (后面跟着标识符和括号)
            if (this.peekTokenIs(TokenType.IDENT) || this.peekTokenIs(TokenType.HASH)) {
                kind = "get";
                this.nextToken();
            }
        } else if (this.curTokenIs(TokenType.SET)) {
            if (this.peekTokenIs(TokenType.IDENT) || this.peekTokenIs(TokenType.HASH)) {
                kind = "set";
                this.nextToken();
            }
        }

        // 检查是否是私有成员
        if (this.curTokenIs(TokenType.HASH) || (this.curToken.literal && this.curToken.literal.startsWith("#"))) {
            return this.parsePrivateFieldOrMethod(isStatic, kind);
        }

        // 检查 constructor
        if (this.curToken.literal === "constructor") {
            kind = "constructor";
        }

        // 检查是否是字段 (没有括号)
        if (this.peekTokenIs(TokenType.ASSIGN) || this.peekTokenIs(TokenType.SEMICOLON) || this.peekTokenIs(TokenType.RBRACE)) {
            return this.parseClassField(isStatic, false);
        }

        // 普通方法
        let key = new AST.Identifier(this.curToken.literal);
        let computed = false;

        // 计算属性名 [expr]
        if (this.curTokenIs(TokenType.LBRACKET)) {
            this.nextToken();
            key = this.parseExpression(Precedence.LOWEST);
            if (!this.expectPeek(TokenType.RBRACKET)) return null;
            computed = true;
        }

        if (!this.expectPeek(TokenType.LPAREN)) {
            // 可能是字段
            return this.parseClassField(isStatic, false, key);
        }
        let params = this.parseFunctionParams();
        if (!this.expectPeek(TokenType.LBRACE)) return null;
        let methodBody = this.parseBlockStatement();
        let value = new AST.FunctionExpression(null, params, methodBody, false);
        return new AST.MethodDefinition(key, value, kind, isStatic, computed);
    },

    parsePrivateFieldOrMethod(isStatic, kind = "method") {
        // 获取私有名称
        let name = this.curToken.literal;
        if (!name.startsWith("#")) {
            this.nextToken();
            name = "#" + this.curToken.literal;
        }
        let key = new AST.PrivateIdentifier(name);

        // 检查是否是方法 (有括号)
        if (this.peekTokenIs(TokenType.LPAREN)) {
            this.nextToken();
            let params = this.parseFunctionParams();
            if (!this.expectPeek(TokenType.LBRACE)) return null;
            let methodBody = this.parseBlockStatement();
            let value = new AST.FunctionExpression(null, params, methodBody, false);
            return new AST.MethodDefinition(key, value, kind, isStatic, false);
        }

        // 私有字段
        let init = null;
        if (this.peekTokenIs(TokenType.ASSIGN)) {
            this.nextToken();
            this.nextToken();
            init = this.parseExpression(Precedence.LOWEST);
        }
        if (this.peekTokenIs(TokenType.SEMICOLON)) this.nextToken();
        return new AST.PropertyDefinition(key, init, false, isStatic);
    },

    parseClassField(isStatic, isPrivate, existingKey = null) {
        let key = existingKey;
        if (!key) {
            let name = this.curToken.literal;
            key = isPrivate ? new AST.PrivateIdentifier(name) : new AST.Identifier(name);
        }

        let init = null;
        if (this.peekTokenIs(TokenType.ASSIGN)) {
            this.nextToken();
            this.nextToken();
            init = this.parseExpression(Precedence.LOWEST);
        }
        if (this.peekTokenIs(TokenType.SEMICOLON)) this.nextToken();
        return new AST.PropertyDefinition(key, init, false, isStatic);
    },

    parseClassExpression() {
        return this.parseClassDeclaration();
    },
};
