// JSBin - JavaScript 语法解析器
// 将词法单元流转换为抽象语法树

import { TokenType } from "../lexer/token.js";
import { Lexer } from "../lexer/index.js";
import * as AST from "./ast.js";

// 运算符优先级
const Precedence = {
    LOWEST: 1,
    COMMA: 2,
    ASSIGN: 3,
    TERNARY: 4,
    OR: 5,
    NULLISH: 6,
    AND: 7,
    BITOR: 8,
    BITXOR: 9,
    BITAND: 10,
    EQUALS: 11,
    COMPARE: 12,
    SHIFT: 13,
    SUM: 14,
    PRODUCT: 15,
    POWER: 16,
    PREFIX: 17,
    POSTFIX: 18,
    CALL: 19,
    MEMBER: 20,
};

// Token 到优先级的映射
const precedences = {};
precedences[TokenType.COMMA] = Precedence.COMMA;
precedences[TokenType.ASSIGN] = Precedence.ASSIGN;
precedences[TokenType.PLUS_ASSIGN] = Precedence.ASSIGN;
precedences[TokenType.MINUS_ASSIGN] = Precedence.ASSIGN;
precedences[TokenType.ASTERISK_ASSIGN] = Precedence.ASSIGN;
precedences[TokenType.SLASH_ASSIGN] = Precedence.ASSIGN;
precedences[TokenType.PERCENT_ASSIGN] = Precedence.ASSIGN;
precedences[TokenType.AND_ASSIGN] = Precedence.ASSIGN;
precedences[TokenType.OR_ASSIGN] = Precedence.ASSIGN;
precedences[TokenType.XOR_ASSIGN] = Precedence.ASSIGN;
precedences[TokenType.LSHIFT_ASSIGN] = Precedence.ASSIGN;
precedences[TokenType.RSHIFT_ASSIGN] = Precedence.ASSIGN;
precedences[TokenType.LOGICAL_AND_ASSIGN] = Precedence.ASSIGN;
precedences[TokenType.LOGICAL_OR_ASSIGN] = Precedence.ASSIGN;
precedences[TokenType.NULLISH_ASSIGN] = Precedence.ASSIGN;
precedences[TokenType.QUESTION] = Precedence.TERNARY;
precedences[TokenType.OR] = Precedence.OR;
precedences[TokenType.NULLISH] = Precedence.NULLISH;
precedences[TokenType.AND] = Precedence.AND;
precedences[TokenType.BITOR] = Precedence.BITOR;
precedences[TokenType.BITXOR] = Precedence.BITXOR;
precedences[TokenType.BITAND] = Precedence.BITAND;
precedences[TokenType.EQ] = Precedence.EQUALS;
precedences[TokenType.NOT_EQ] = Precedence.EQUALS;
precedences[TokenType.STRICT_EQ] = Precedence.EQUALS;
precedences[TokenType.STRICT_NOT_EQ] = Precedence.EQUALS;
precedences[TokenType.LT] = Precedence.COMPARE;
precedences[TokenType.GT] = Precedence.COMPARE;
precedences[TokenType.LTE] = Precedence.COMPARE;
precedences[TokenType.GTE] = Precedence.COMPARE;
precedences[TokenType.INSTANCEOF] = Precedence.COMPARE;
precedences[TokenType.IN] = Precedence.COMPARE;
precedences[TokenType.LSHIFT] = Precedence.SHIFT;
precedences[TokenType.RSHIFT] = Precedence.SHIFT;
precedences[TokenType.URSHIFT] = Precedence.SHIFT;
precedences[TokenType.PLUS] = Precedence.SUM;
precedences[TokenType.MINUS] = Precedence.SUM;
precedences[TokenType.ASTERISK] = Precedence.PRODUCT;
precedences[TokenType.SLASH] = Precedence.PRODUCT;
precedences[TokenType.PERCENT] = Precedence.PRODUCT;
precedences[TokenType.POWER] = Precedence.POWER;
precedences[TokenType.LPAREN] = Precedence.CALL;
precedences[TokenType.LBRACKET] = Precedence.MEMBER;
precedences[TokenType.DOT] = Precedence.MEMBER;
precedences[TokenType.OPTIONAL] = Precedence.MEMBER;
precedences[TokenType.INCREMENT] = Precedence.POSTFIX;
precedences[TokenType.DECREMENT] = Precedence.POSTFIX;

// 解析器类
export class Parser {
    constructor(lexer) {
        this.lexer = lexer;
        this.curToken = null;
        this.peekToken = null;
        this.errors = [];

        this.prefixParseFns = {};
        this.infixParseFns = {};

        this.registerParseFns();

        this.nextToken();
        this.nextToken();
    }

    registerParseFns() {
        // 前缀解析函数
        this.prefixParseFns[TokenType.IDENT] = () => this.parseIdentifier();
        this.prefixParseFns[TokenType.INT] = () => this.parseNumberLiteral();
        this.prefixParseFns[TokenType.FLOAT] = () => this.parseNumberLiteral();
        this.prefixParseFns[TokenType.STRING] = () => this.parseStringLiteral();
        this.prefixParseFns[TokenType.TEMPLATE_STRING] = () => this.parseTemplateLiteral();
        this.prefixParseFns[TokenType.TEMPLATE_HEAD] = () => this.parseTemplateLiteralWithExpressions();
        this.prefixParseFns[TokenType.TRUE] = () => this.parseBooleanLiteral();
        this.prefixParseFns[TokenType.FALSE] = () => this.parseBooleanLiteral();
        this.prefixParseFns[TokenType.NULL] = () => this.parseNullLiteral();
        this.prefixParseFns[TokenType.UNDEFINED] = () => this.parseUndefinedLiteral();
        this.prefixParseFns[TokenType.BANG] = () => this.parsePrefixExpression();
        this.prefixParseFns[TokenType.MINUS] = () => this.parsePrefixExpression();
        this.prefixParseFns[TokenType.PLUS] = () => this.parsePrefixExpression();
        this.prefixParseFns[TokenType.BITNOT] = () => this.parsePrefixExpression();
        this.prefixParseFns[TokenType.INCREMENT] = () => this.parsePrefixUpdateExpression();
        this.prefixParseFns[TokenType.DECREMENT] = () => this.parsePrefixUpdateExpression();
        this.prefixParseFns[TokenType.TYPEOF] = () => this.parsePrefixExpression();
        this.prefixParseFns[TokenType.VOID] = () => this.parsePrefixExpression();
        this.prefixParseFns[TokenType.DELETE] = () => this.parsePrefixExpression();
        this.prefixParseFns[TokenType.LPAREN] = () => this.parseGroupedOrArrow();
        this.prefixParseFns[TokenType.LBRACKET] = () => this.parseArrayLiteral();
        this.prefixParseFns[TokenType.LBRACE] = () => this.parseObjectLiteral();
        this.prefixParseFns[TokenType.CLASS] = () => this.parseClassExpression();
        this.prefixParseFns[TokenType.THIS] = () => this.parseThisExpression();
        this.prefixParseFns[TokenType.SUPER] = () => this.parseSuperExpression();
        this.prefixParseFns[TokenType.NEW] = () => this.parseNewExpression();
        this.prefixParseFns[TokenType.ASYNC] = () => this.parseAsyncExpression();
        this.prefixParseFns[TokenType.AWAIT] = () => this.parseAwaitExpression();
        this.prefixParseFns[TokenType.SPREAD] = () => this.parseSpreadExpression();
        this.prefixParseFns[TokenType.FUNCTION] = () => this.parseFunctionExpression();

        // 中缀解析函数
        this.infixParseFns[TokenType.PLUS] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.MINUS] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.ASTERISK] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.SLASH] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.PERCENT] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.POWER] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.EQ] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.NOT_EQ] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.STRICT_EQ] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.STRICT_NOT_EQ] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.LT] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.GT] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.LTE] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.GTE] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.AND] = (left) => this.parseLogicalExpression(left);
        this.infixParseFns[TokenType.OR] = (left) => this.parseLogicalExpression(left);
        this.infixParseFns[TokenType.NULLISH] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.BITAND] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.BITOR] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.BITXOR] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.LSHIFT] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.RSHIFT] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.URSHIFT] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.INSTANCEOF] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.IN] = (left) => this.parseBinaryExpression(left);
        this.infixParseFns[TokenType.LPAREN] = (left) => this.parseCallExpression(left);
        this.infixParseFns[TokenType.LBRACKET] = (left) => this.parseIndexExpression(left);
        this.infixParseFns[TokenType.DOT] = (left) => this.parseMemberExpression(left);
        this.infixParseFns[TokenType.OPTIONAL] = (left) => this.parseOptionalMemberExpression(left);
        this.infixParseFns[TokenType.ASSIGN] = (left) => this.parseAssignmentExpression(left);
        this.infixParseFns[TokenType.PLUS_ASSIGN] = (left) => this.parseAssignmentExpression(left);
        this.infixParseFns[TokenType.MINUS_ASSIGN] = (left) => this.parseAssignmentExpression(left);
        this.infixParseFns[TokenType.ASTERISK_ASSIGN] = (left) => this.parseAssignmentExpression(left);
        this.infixParseFns[TokenType.SLASH_ASSIGN] = (left) => this.parseAssignmentExpression(left);
        this.infixParseFns[TokenType.PERCENT_ASSIGN] = (left) => this.parseAssignmentExpression(left);
        this.infixParseFns[TokenType.AND_ASSIGN] = (left) => this.parseAssignmentExpression(left);
        this.infixParseFns[TokenType.OR_ASSIGN] = (left) => this.parseAssignmentExpression(left);
        this.infixParseFns[TokenType.XOR_ASSIGN] = (left) => this.parseAssignmentExpression(left);
        this.infixParseFns[TokenType.LSHIFT_ASSIGN] = (left) => this.parseAssignmentExpression(left);
        this.infixParseFns[TokenType.RSHIFT_ASSIGN] = (left) => this.parseAssignmentExpression(left);
        this.infixParseFns[TokenType.LOGICAL_AND_ASSIGN] = (left) => this.parseAssignmentExpression(left);
        this.infixParseFns[TokenType.LOGICAL_OR_ASSIGN] = (left) => this.parseAssignmentExpression(left);
        this.infixParseFns[TokenType.NULLISH_ASSIGN] = (left) => this.parseAssignmentExpression(left);
        this.infixParseFns[TokenType.QUESTION] = (left) => this.parseConditionalExpression(left);
        this.infixParseFns[TokenType.INCREMENT] = (left) => this.parsePostfixUpdateExpression(left);
        this.infixParseFns[TokenType.DECREMENT] = (left) => this.parsePostfixUpdateExpression(left);
    }

    nextToken() {
        this.curToken = this.peekToken;
        this.peekToken = this.lexer.nextToken();
    }

    curTokenIs(t) {
        return this.curToken.type === t;
    }
    peekTokenIs(t) {
        return this.peekToken.type === t;
    }

    expectPeek(t) {
        if (this.peekTokenIs(t)) {
            this.nextToken();
            return true;
        }
        this.peekError(t);
        return false;
    }

    peekError(t) {
        this.errors.push("expected " + t + ", got " + this.peekToken.type);
    }

    curPrecedence() {
        return precedences[this.curToken.type] || Precedence.LOWEST;
    }

    peekPrecedence() {
        return precedences[this.peekToken.type] || Precedence.LOWEST;
    }

    // ============ 解析程序 ============

    parseProgram() {
        let program = new AST.Program();
        while (!this.curTokenIs(TokenType.EOF)) {
            let stmt = this.parseStatement();
            if (stmt !== null) {
                program.body.push(stmt);
            }
            this.nextToken();
        }
        return program;
    }

    // ============ 解析语句 ============

    parseStatement() {
        if (this.curTokenIs(TokenType.LET) || this.curTokenIs(TokenType.CONST) || this.curTokenIs(TokenType.VAR) || this.curTokenIs(TokenType.INT_TYPE)) {
            return this.parseVariableDeclaration();
        } else if (this.curTokenIs(TokenType.FUNCTION)) {
            return this.parseFunctionDeclaration();
        } else if (this.curTokenIs(TokenType.ASYNC) && this.peekTokenIs(TokenType.FUNCTION)) {
            return this.parseFunctionDeclaration();
        } else if (this.curTokenIs(TokenType.CLASS)) {
            return this.parseClassDeclaration();
        } else if (this.curTokenIs(TokenType.RETURN)) {
            return this.parseReturnStatement();
        } else if (this.curTokenIs(TokenType.IF)) {
            return this.parseIfStatement();
        } else if (this.curTokenIs(TokenType.FOR)) {
            return this.parseForStatement();
        } else if (this.curTokenIs(TokenType.WHILE)) {
            return this.parseWhileStatement();
        } else if (this.curTokenIs(TokenType.DO)) {
            return this.parseDoWhileStatement();
        } else if (this.curTokenIs(TokenType.SWITCH)) {
            return this.parseSwitchStatement();
        } else if (this.curTokenIs(TokenType.BREAK)) {
            return this.parseBreakStatement();
        } else if (this.curTokenIs(TokenType.CONTINUE)) {
            return this.parseContinueStatement();
        } else if (this.curTokenIs(TokenType.TRY)) {
            return this.parseTryStatement();
        } else if (this.curTokenIs(TokenType.THROW)) {
            return this.parseThrowStatement();
        } else if (this.curTokenIs(TokenType.IMPORT)) {
            return this.parseImportDeclaration();
        } else if (this.curTokenIs(TokenType.EXPORT)) {
            return this.parseExportDeclaration();
        } else if (this.curTokenIs(TokenType.LBRACE)) {
            return this.parseBlockStatement();
        } else {
            return this.parseExpressionStatement();
        }
    }

    parseVariableDeclaration() {
        let decl = new AST.VariableDeclaration(this.curToken.literal);
        do {
            this.nextToken();
            let id;
            if (this.curTokenIs(TokenType.LBRACE)) {
                id = this.parseObjectPattern();
            } else if (this.curTokenIs(TokenType.LBRACKET)) {
                id = this.parseArrayPattern();
            } else if (this.curTokenIs(TokenType.IDENT)) {
                id = new AST.Identifier(this.curToken.literal);
            } else {
                this.errors.push("expected identifier");
                return null;
            }
            let init = null;
            if (this.peekTokenIs(TokenType.ASSIGN)) {
                this.nextToken();
                this.nextToken();
                init = this.parseExpression(Precedence.LOWEST);
            }
            decl.declarations.push(new AST.VariableDeclarator(id, init));
        } while (this.peekTokenIs(TokenType.COMMA) && this.nextToken());
        if (this.peekTokenIs(TokenType.SEMICOLON)) this.nextToken();
        return decl;
    }

    parseFunctionDeclaration() {
        let isAsync = false;
        if (this.curTokenIs(TokenType.ASYNC)) {
            isAsync = true;
            this.nextToken();
        }
        if (!this.expectPeek(TokenType.IDENT)) return null;
        let id = new AST.Identifier(this.curToken.literal);
        if (!this.expectPeek(TokenType.LPAREN)) return null;
        let params = this.parseFunctionParams();
        if (!this.expectPeek(TokenType.LBRACE)) return null;
        let body = this.parseBlockStatement();
        return new AST.FunctionDeclaration(id, params, body, isAsync);
    }

    parseFunctionParams() {
        let params = [];
        if (this.peekTokenIs(TokenType.RPAREN)) {
            this.nextToken();
            return params;
        }
        this.nextToken();
        params.push(this.parseFunctionParam());
        while (this.peekTokenIs(TokenType.COMMA)) {
            this.nextToken();
            this.nextToken();
            params.push(this.parseFunctionParam());
        }
        if (!this.expectPeek(TokenType.RPAREN)) return null;
        return params;
    }

    parseFunctionParam() {
        if (this.curTokenIs(TokenType.SPREAD)) {
            this.nextToken();
            return new AST.SpreadElement(new AST.Identifier(this.curToken.literal));
        }
        let id = new AST.Identifier(this.curToken.literal);
        if (this.peekTokenIs(TokenType.ASSIGN)) {
            this.nextToken();
            this.nextToken();
            return new AST.AssignmentPattern(id, this.parseExpression(Precedence.LOWEST));
        }
        return id;
    }

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
    }

    parseClassBody() {
        let body = [];
        this.nextToken();
        while (!this.curTokenIs(TokenType.RBRACE) && !this.curTokenIs(TokenType.EOF)) {
            let isStatic = false;
            let kind = "method";
            if (this.curTokenIs(TokenType.STATIC)) {
                isStatic = true;
                this.nextToken();
            }
            if (this.curTokenIs(TokenType.GET)) {
                kind = "get";
                this.nextToken();
            } else if (this.curTokenIs(TokenType.SET)) {
                kind = "set";
                this.nextToken();
            }
            if (this.curToken.literal === "constructor") kind = "constructor";
            let key = new AST.Identifier(this.curToken.literal);
            if (!this.expectPeek(TokenType.LPAREN)) return null;
            let params = this.parseFunctionParams();
            if (!this.expectPeek(TokenType.LBRACE)) return null;
            let methodBody = this.parseBlockStatement();
            let value = new AST.FunctionExpression(null, params, methodBody, false);
            body.push(new AST.MethodDefinition(key, value, kind, isStatic, false));
            this.nextToken();
        }
        return body;
    }

    parseBlockStatement() {
        let block = new AST.BlockStatement([]);
        this.nextToken();
        while (!this.curTokenIs(TokenType.RBRACE) && !this.curTokenIs(TokenType.EOF)) {
            let stmt = this.parseStatement();
            if (stmt !== null) block.body.push(stmt);
            this.nextToken();
        }
        return block;
    }

    parseReturnStatement() {
        let stmt = new AST.ReturnStatement(null);
        this.nextToken();
        if (!this.curTokenIs(TokenType.SEMICOLON) && !this.curTokenIs(TokenType.RBRACE)) {
            stmt.argument = this.parseExpression(Precedence.LOWEST);
        }
        if (this.peekTokenIs(TokenType.SEMICOLON)) this.nextToken();
        return stmt;
    }

    parseIfStatement() {
        if (!this.expectPeek(TokenType.LPAREN)) return null;
        this.nextToken();
        let test = this.parseExpression(Precedence.LOWEST);
        if (!this.expectPeek(TokenType.RPAREN)) return null;
        this.nextToken();
        let consequent = this.curTokenIs(TokenType.LBRACE) ? this.parseBlockStatement() : this.parseStatement();
        let alternate = null;
        if (this.peekTokenIs(TokenType.ELSE)) {
            this.nextToken();
            this.nextToken();
            if (this.curTokenIs(TokenType.IF)) {
                alternate = this.parseIfStatement();
            } else if (this.curTokenIs(TokenType.LBRACE)) {
                alternate = this.parseBlockStatement();
            } else {
                alternate = this.parseStatement();
            }
        }
        return new AST.IfStatement(test, consequent, alternate);
    }

    parseForStatement() {
        if (!this.expectPeek(TokenType.LPAREN)) return null;
        this.nextToken();
        let init = null;
        if (this.curTokenIs(TokenType.LET) || this.curTokenIs(TokenType.CONST) || this.curTokenIs(TokenType.VAR)) {
            init = this.parseVariableDeclaration();
            if (this.peekTokenIs(TokenType.IN)) {
                this.nextToken();
                this.nextToken();
                let right = this.parseExpression(Precedence.LOWEST);
                if (!this.expectPeek(TokenType.RPAREN)) return null;
                this.nextToken();
                let body = this.curTokenIs(TokenType.LBRACE) ? this.parseBlockStatement() : this.parseStatement();
                return new AST.ForInStatement(init, right, body);
            }
            if (this.peekTokenIs(TokenType.OF)) {
                this.nextToken();
                this.nextToken();
                let right = this.parseExpression(Precedence.LOWEST);
                if (!this.expectPeek(TokenType.RPAREN)) return null;
                this.nextToken();
                let body = this.curTokenIs(TokenType.LBRACE) ? this.parseBlockStatement() : this.parseStatement();
                return new AST.ForOfStatement(init, right, body);
            }
        } else if (!this.curTokenIs(TokenType.SEMICOLON)) {
            init = this.parseExpression(Precedence.LOWEST);
        }
        if (!this.curTokenIs(TokenType.SEMICOLON)) {
            if (!this.expectPeek(TokenType.SEMICOLON)) return null;
        }
        this.nextToken();
        let test = null;
        if (!this.curTokenIs(TokenType.SEMICOLON)) {
            test = this.parseExpression(Precedence.LOWEST);
        }
        if (!this.expectPeek(TokenType.SEMICOLON)) return null;
        this.nextToken();
        let update = null;
        if (!this.curTokenIs(TokenType.RPAREN)) {
            update = this.parseExpression(Precedence.LOWEST);
        }
        if (!this.expectPeek(TokenType.RPAREN)) return null;
        this.nextToken();
        let body = this.curTokenIs(TokenType.LBRACE) ? this.parseBlockStatement() : this.parseStatement();
        return new AST.ForStatement(init, test, update, body);
    }

    parseWhileStatement() {
        if (!this.expectPeek(TokenType.LPAREN)) return null;
        this.nextToken();
        let test = this.parseExpression(Precedence.LOWEST);
        if (!this.expectPeek(TokenType.RPAREN)) return null;
        this.nextToken();
        let body = this.curTokenIs(TokenType.LBRACE) ? this.parseBlockStatement() : this.parseStatement();
        return new AST.WhileStatement(test, body);
    }

    parseDoWhileStatement() {
        this.nextToken();
        let body = this.curTokenIs(TokenType.LBRACE) ? this.parseBlockStatement() : this.parseStatement();
        if (!this.expectPeek(TokenType.WHILE)) return null;
        if (!this.expectPeek(TokenType.LPAREN)) return null;
        this.nextToken();
        let test = this.parseExpression(Precedence.LOWEST);
        if (!this.expectPeek(TokenType.RPAREN)) return null;
        if (this.peekTokenIs(TokenType.SEMICOLON)) this.nextToken();
        return new AST.DoWhileStatement(body, test);
    }

    parseSwitchStatement() {
        if (!this.expectPeek(TokenType.LPAREN)) return null;
        this.nextToken();
        let discriminant = this.parseExpression(Precedence.LOWEST);
        if (!this.expectPeek(TokenType.RPAREN)) return null;
        if (!this.expectPeek(TokenType.LBRACE)) return null;
        let cases = [];
        this.nextToken();
        while (!this.curTokenIs(TokenType.RBRACE) && !this.curTokenIs(TokenType.EOF)) {
            let test = null;
            if (this.curTokenIs(TokenType.CASE)) {
                this.nextToken();
                test = this.parseExpression(Precedence.LOWEST);
            } else if (!this.curTokenIs(TokenType.DEFAULT)) {
                this.nextToken();
                continue;
            }
            if (!this.expectPeek(TokenType.COLON)) return null;
            let consequent = [];
            this.nextToken();
            while (!this.curTokenIs(TokenType.CASE) && !this.curTokenIs(TokenType.DEFAULT) && !this.curTokenIs(TokenType.RBRACE) && !this.curTokenIs(TokenType.EOF)) {
                let stmt = this.parseStatement();
                if (stmt !== null) consequent.push(stmt);
                this.nextToken();
            }
            cases.push(new AST.SwitchCase(test, consequent));
        }
        return new AST.SwitchStatement(discriminant, cases);
    }

    parseBreakStatement() {
        let label = null;
        if (this.peekTokenIs(TokenType.IDENT)) {
            this.nextToken();
            label = new AST.Identifier(this.curToken.literal);
        }
        if (this.peekTokenIs(TokenType.SEMICOLON)) this.nextToken();
        return new AST.BreakStatement(label);
    }

    parseContinueStatement() {
        let label = null;
        if (this.peekTokenIs(TokenType.IDENT)) {
            this.nextToken();
            label = new AST.Identifier(this.curToken.literal);
        }
        if (this.peekTokenIs(TokenType.SEMICOLON)) this.nextToken();
        return new AST.ContinueStatement(label);
    }

    parseTryStatement() {
        if (!this.expectPeek(TokenType.LBRACE)) return null;
        let block = this.parseBlockStatement();
        let handler = null;
        let finalizer = null;
        if (this.peekTokenIs(TokenType.CATCH)) {
            this.nextToken();
            let param = null;
            if (this.peekTokenIs(TokenType.LPAREN)) {
                this.nextToken();
                this.nextToken();
                param = new AST.Identifier(this.curToken.literal);
                if (!this.expectPeek(TokenType.RPAREN)) return null;
            }
            if (!this.expectPeek(TokenType.LBRACE)) return null;
            let catchBody = this.parseBlockStatement();
            handler = new AST.CatchClause(param, catchBody);
        }
        if (this.peekTokenIs(TokenType.FINALLY)) {
            this.nextToken();
            if (!this.expectPeek(TokenType.LBRACE)) return null;
            finalizer = this.parseBlockStatement();
        }
        return new AST.TryStatement(block, handler, finalizer);
    }

    parseThrowStatement() {
        this.nextToken();
        let argument = this.parseExpression(Precedence.LOWEST);
        if (this.peekTokenIs(TokenType.SEMICOLON)) this.nextToken();
        return new AST.ThrowStatement(argument);
    }

    parseImportDeclaration() {
        let specifiers = [];
        let source = null;
        this.nextToken();

        if (this.curTokenIs(TokenType.STRING)) {
            let libPath = this.curToken.literal;
            source = new AST.Literal(libPath, '"' + libPath + '"');
            // 检查是否是 jslib 文件
            if (libPath.endsWith(".jslib")) {
                if (this.peekTokenIs(TokenType.SEMICOLON)) this.nextToken();
                return new AST.ImportLibDeclaration(libPath, []);
            }
            if (this.peekTokenIs(TokenType.SEMICOLON)) this.nextToken();
            return new AST.ImportDeclaration(specifiers, source);
        }

        if (this.curTokenIs(TokenType.ASTERISK)) {
            if (this.peekTokenIs(TokenType.FROM)) {
                this.nextToken();
                if (!this.expectPeek(TokenType.STRING)) return null;
                let libPath = this.curToken.literal;
                if (libPath.endsWith(".jslib")) {
                    if (this.peekTokenIs(TokenType.SEMICOLON)) this.nextToken();
                    return new AST.ImportLibDeclaration(libPath, []);
                }
                this.errors.push("import * from requires .jslib file or use 'import * as name from'");
                return null;
            }
            if (!this.expectPeek(TokenType.AS)) return null;
            this.nextToken();
            let local = new AST.Identifier(this.curToken.literal);
            specifiers.push(new AST.ImportSpecifier(local, null, false, true));
        } else if (this.curTokenIs(TokenType.LBRACE)) {
            this.nextToken();
            while (!this.curTokenIs(TokenType.RBRACE) && !this.curTokenIs(TokenType.EOF)) {
                let imported = new AST.Identifier(this.curToken.literal);
                let local = imported;
                if (this.peekTokenIs(TokenType.AS)) {
                    this.nextToken();
                    this.nextToken();
                    local = new AST.Identifier(this.curToken.literal);
                }
                specifiers.push(new AST.ImportSpecifier(local, imported, false, false));
                if (this.peekTokenIs(TokenType.COMMA)) {
                    this.nextToken();
                    this.nextToken();
                } else {
                    break;
                }
            }
            if (!this.expectPeek(TokenType.RBRACE)) return null;
        } else if (this.curTokenIs(TokenType.IDENT)) {
            let local = new AST.Identifier(this.curToken.literal);
            specifiers.push(new AST.ImportSpecifier(local, null, true, false));
            if (this.peekTokenIs(TokenType.COMMA)) {
                this.nextToken();
                this.nextToken();
                if (this.curTokenIs(TokenType.LBRACE)) {
                    this.nextToken();
                    while (!this.curTokenIs(TokenType.RBRACE) && !this.curTokenIs(TokenType.EOF)) {
                        let imported = new AST.Identifier(this.curToken.literal);
                        let local2 = imported;
                        if (this.peekTokenIs(TokenType.AS)) {
                            this.nextToken();
                            this.nextToken();
                            local2 = new AST.Identifier(this.curToken.literal);
                        }
                        specifiers.push(new AST.ImportSpecifier(local2, imported, false, false));
                        if (this.peekTokenIs(TokenType.COMMA)) {
                            this.nextToken();
                            this.nextToken();
                        } else {
                            break;
                        }
                    }
                    if (!this.expectPeek(TokenType.RBRACE)) return null;
                }
            }
        }

        if (!this.expectPeek(TokenType.FROM)) return null;
        if (!this.expectPeek(TokenType.STRING)) return null;
        source = new AST.Literal(this.curToken.literal, '"' + this.curToken.literal + '"');
        if (this.peekTokenIs(TokenType.SEMICOLON)) this.nextToken();
        return new AST.ImportDeclaration(specifiers, source);
    }

    parseExportDeclaration() {
        this.nextToken();
        let isDefault = false;
        let declaration = null;
        let specifiers = [];
        let source = null;

        if (this.curTokenIs(TokenType.DEFAULT)) {
            isDefault = true;
            this.nextToken();
            if (this.curTokenIs(TokenType.FUNCTION)) {
                declaration = this.parseFunctionDeclaration();
            } else if (this.curTokenIs(TokenType.CLASS)) {
                declaration = this.parseClassDeclaration();
            } else {
                declaration = this.parseExpression(Precedence.LOWEST);
            }
        } else if (this.curTokenIs(TokenType.FUNCTION)) {
            declaration = this.parseFunctionDeclaration();
        } else if (this.curTokenIs(TokenType.CLASS)) {
            declaration = this.parseClassDeclaration();
        } else if (this.curTokenIs(TokenType.CONST) || this.curTokenIs(TokenType.LET) || this.curTokenIs(TokenType.VAR)) {
            declaration = this.parseVariableDeclaration();
        } else if (this.curTokenIs(TokenType.LBRACE)) {
            this.nextToken();
            while (!this.curTokenIs(TokenType.RBRACE) && !this.curTokenIs(TokenType.EOF)) {
                let local = new AST.Identifier(this.curToken.literal);
                let exported = local;
                if (this.peekTokenIs(TokenType.AS)) {
                    this.nextToken();
                    this.nextToken();
                    exported = new AST.Identifier(this.curToken.literal);
                }
                specifiers.push(new AST.ExportSpecifier(local, exported));
                if (this.peekTokenIs(TokenType.COMMA)) {
                    this.nextToken();
                    this.nextToken();
                } else {
                    break;
                }
            }
            if (!this.expectPeek(TokenType.RBRACE)) return null;
            if (this.peekTokenIs(TokenType.FROM)) {
                this.nextToken();
                if (!this.expectPeek(TokenType.STRING)) return null;
                source = new AST.Literal(this.curToken.literal, '"' + this.curToken.literal + '"');
            }
        } else if (this.curTokenIs(TokenType.ASTERISK)) {
            if (!this.expectPeek(TokenType.FROM)) return null;
            if (!this.expectPeek(TokenType.STRING)) return null;
            source = new AST.Literal(this.curToken.literal, '"' + this.curToken.literal + '"');
        }

        if (this.peekTokenIs(TokenType.SEMICOLON)) this.nextToken();
        return new AST.ExportDeclaration(declaration, specifiers, source, isDefault);
    }

    parseExpressionStatement() {
        let expr = this.parseExpression(Precedence.LOWEST);
        if (this.peekTokenIs(TokenType.SEMICOLON)) this.nextToken();
        return new AST.ExpressionStatement(expr);
    }

    // ============ 解析表达式 ============

    parseExpression(precedence) {
        let prefix = this.prefixParseFns[this.curToken.type];
        if (prefix === undefined) {
            this.errors.push("no prefix parse function for " + this.curToken.type);
            return null;
        }
        let leftExp = prefix();
        while (!this.peekTokenIs(TokenType.SEMICOLON) && precedence < this.peekPrecedence()) {
            let infix = this.infixParseFns[this.peekToken.type];
            if (infix === undefined) return leftExp;
            this.nextToken();
            leftExp = infix(leftExp);
        }
        return leftExp;
    }

    parseIdentifier() {
        const ident = new AST.Identifier(this.curToken.literal);
        // 检查是否是无括号单参数箭头函数: x => expr
        if (this.peekTokenIs(TokenType.ARROW)) {
            this.nextToken(); // 消费 =>
            return this.parseArrowFunctionBody([ident]);
        }
        return ident;
    }
    parseNumberLiteral() {
        const raw = this.curToken.literal;
        // 如果包含小数点或指数，解析为浮点数；否则解析为整数
        if (raw.includes(".") || raw.includes("e") || raw.includes("E")) {
            return new AST.Literal(parseFloat(raw), raw);
        } else {
            // 整数：支持十六进制、八进制、二进制
            return new AST.Literal(parseInt(raw), raw);
        }
    }
    parseStringLiteral() {
        return new AST.Literal(this.curToken.literal, '"' + this.curToken.literal + '"');
    }
    parseTemplateLiteral() {
        // 简单模板字符串（无插值）：创建 TemplateLiteral 节点
        let quasi = {
            type: "TemplateElement",
            value: { raw: this.curToken.literal, cooked: this.curToken.literal },
            tail: true,
        };
        return new AST.TemplateLiteral([quasi], []);
    }
    parseTemplateLiteralWithExpressions() {
        // 带插值的模板字符串
        let quasis = [];
        let expressions = [];

        // 第一个静态部分 (TEMPLATE_HEAD)
        let firstQuasi = {
            type: "TemplateElement",
            value: { raw: this.curToken.literal, cooked: this.curToken.literal },
            tail: false,
        };
        quasis.push(firstQuasi);

        // 解析表达式和后续的静态部分
        while (true) {
            this.nextToken(); // 跳过 TEMPLATE_HEAD/TEMPLATE_MIDDLE

            // 解析表达式
            let expr = this.parseExpression(Precedence.LOWEST);
            expressions.push(expr);

            // 下一个 token 应该是 TEMPLATE_MIDDLE 或 TEMPLATE_TAIL
            // (lexer 在遇到 } 时会自动读取模板内容)
            this.nextToken();

            // 创建静态部分
            let quasi = {
                type: "TemplateElement",
                value: { raw: this.curToken.literal, cooked: this.curToken.literal },
                tail: this.curToken.type === TokenType.TEMPLATE_TAIL,
            };
            quasis.push(quasi);

            if (this.curToken.type === TokenType.TEMPLATE_TAIL) {
                // 模板字符串结束
                break;
            }

            // 如果不是 TEMPLATE_MIDDLE，说明有问题
            if (this.curToken.type !== TokenType.TEMPLATE_MIDDLE) {
                this.errors.push("unexpected token in template literal: " + this.curToken.type);
                return null;
            }
            // 继续循环处理下一个表达式
        }

        return new AST.TemplateLiteral(quasis, expressions);
    }
    parseBooleanLiteral() {
        return new AST.Literal(this.curTokenIs(TokenType.TRUE), this.curToken.literal);
    }
    parseNullLiteral() {
        return new AST.Literal(null, "null");
    }
    parseUndefinedLiteral() {
        return new AST.Literal(undefined, "undefined");
    }

    parsePrefixExpression() {
        let operator = this.curToken.literal;
        this.nextToken();
        return new AST.UnaryExpression(operator, this.parseExpression(Precedence.PREFIX), true);
    }

    parseAwaitExpression() {
        this.nextToken();
        return new AST.AwaitExpression(this.parseExpression(Precedence.PREFIX));
    }

    parsePrefixUpdateExpression() {
        let operator = this.curToken.literal;
        this.nextToken();
        return new AST.UpdateExpression(operator, this.parseExpression(Precedence.PREFIX), true);
    }

    parsePostfixUpdateExpression(left) {
        return new AST.UpdateExpression(this.curToken.literal, left, false);
    }

    parseBinaryExpression(left) {
        let operator = this.curToken.literal;
        let precedence = this.curPrecedence();
        this.nextToken();
        return new AST.BinaryExpression(operator, left, this.parseExpression(precedence));
    }

    parseLogicalExpression(left) {
        let operator = this.curToken.literal;
        let precedence = this.curPrecedence();
        this.nextToken();
        return new AST.LogicalExpression(operator, left, this.parseExpression(precedence));
    }

    parseAssignmentExpression(left) {
        let operator = this.curToken.literal;
        this.nextToken();
        return new AST.AssignmentExpression(operator, left, this.parseExpression(Precedence.ASSIGN - 1));
    }

    parseConditionalExpression(test) {
        this.nextToken();
        let consequent = this.parseExpression(Precedence.LOWEST);
        if (!this.expectPeek(TokenType.COLON)) return null;
        this.nextToken();
        return new AST.ConditionalExpression(test, consequent, this.parseExpression(Precedence.TERNARY - 1));
    }

    parseGroupedOrArrow() {
        this.nextToken();
        if (this.curTokenIs(TokenType.RPAREN)) {
            if (this.peekTokenIs(TokenType.ARROW)) {
                this.nextToken();
                return this.parseArrowFunctionBody([]);
            }
        }
        let params = [];
        let isArrow = false;
        if (this.curTokenIs(TokenType.IDENT) || this.curTokenIs(TokenType.SPREAD)) {
            while (true) {
                if (this.curTokenIs(TokenType.SPREAD)) {
                    this.nextToken();
                    params.push(new AST.SpreadElement(new AST.Identifier(this.curToken.literal)));
                } else {
                    params.push(new AST.Identifier(this.curToken.literal));
                }
                if (this.peekTokenIs(TokenType.COMMA)) {
                    this.nextToken();
                    this.nextToken();
                } else if (this.peekTokenIs(TokenType.RPAREN)) {
                    this.nextToken();
                    if (this.peekTokenIs(TokenType.ARROW)) {
                        this.nextToken();
                        isArrow = true;
                    }
                    break;
                } else {
                    break;
                }
            }
        }
        if (isArrow) return this.parseArrowFunctionBody(params);
        let expr = this.parseExpression(Precedence.LOWEST);
        if (!this.curTokenIs(TokenType.RPAREN)) {
            if (!this.expectPeek(TokenType.RPAREN)) return null;
        }
        if (this.peekTokenIs(TokenType.ARROW) && expr.type === "Identifier") {
            this.nextToken();
            return this.parseArrowFunctionBody([expr]);
        }
        return expr;
    }

    parseArrowFunctionBody(params) {
        this.nextToken();
        let body,
            isExpression = false;
        if (this.curTokenIs(TokenType.LBRACE)) {
            body = this.parseBlockStatement();
        } else {
            body = this.parseExpression(Precedence.LOWEST);
            isExpression = true;
        }
        return new AST.ArrowFunctionExpression(params, body, false, isExpression);
    }

    parseObjectPattern() {
        let pattern = new AST.ObjectPattern();
        if (this.peekTokenIs(TokenType.RBRACE)) {
            this.nextToken();
            return pattern;
        }
        this.nextToken();
        while (!this.curTokenIs(TokenType.RBRACE) && !this.curTokenIs(TokenType.EOF)) {
            let prop = new AST.AssignmentProperty();
            if (this.curTokenIs(TokenType.IDENT)) {
                prop.key = new AST.Identifier(this.curToken.literal);
            } else {
                this.errors.push("expected property name in object pattern");
                return null;
            }
            if (this.peekTokenIs(TokenType.COLON)) {
                this.nextToken();
                this.nextToken();
                if (this.curTokenIs(TokenType.IDENT)) {
                    prop.value = new AST.Identifier(this.curToken.literal);
                } else {
                    this.errors.push("expected identifier in object pattern");
                    return null;
                }
            } else {
                prop.shorthand = true;
                prop.value = prop.key;
            }
            pattern.properties.push(prop);
            if (this.peekTokenIs(TokenType.COMMA)) {
                this.nextToken();
                if (this.peekTokenIs(TokenType.RBRACE)) {
                    this.nextToken();
                    break;
                }
                this.nextToken();
            } else {
                break;
            }
        }
        if (!this.expectPeek(TokenType.RBRACE)) return null;
        return pattern;
    }

    parseArrayPattern() {
        let pattern = new AST.ArrayPattern();
        if (this.peekTokenIs(TokenType.RBRACKET)) {
            this.nextToken();
            return pattern;
        }
        this.nextToken();
        while (!this.curTokenIs(TokenType.RBRACKET) && !this.curTokenIs(TokenType.EOF)) {
            if (this.curTokenIs(TokenType.IDENT)) {
                pattern.elements.push(new AST.Identifier(this.curToken.literal));
            } else if (this.curTokenIs(TokenType.COMMA)) {
                pattern.elements.push(null);
            }
            if (this.peekTokenIs(TokenType.COMMA)) {
                this.nextToken();
                if (this.peekTokenIs(TokenType.RBRACKET)) {
                    this.nextToken();
                    break;
                }
                this.nextToken();
            } else {
                break;
            }
        }
        if (!this.expectPeek(TokenType.RBRACKET)) return null;
        return pattern;
    }

    parseArrayLiteral() {
        let elements = [];
        if (this.peekTokenIs(TokenType.RBRACKET)) {
            this.nextToken();
            return new AST.ArrayExpression(elements);
        }
        this.nextToken();
        while (!this.curTokenIs(TokenType.RBRACKET) && !this.curTokenIs(TokenType.EOF)) {
            if (this.curTokenIs(TokenType.SPREAD)) {
                this.nextToken();
                elements.push(new AST.SpreadElement(this.parseExpression(Precedence.LOWEST)));
            } else {
                elements.push(this.parseExpression(Precedence.LOWEST));
            }
            if (this.peekTokenIs(TokenType.COMMA)) {
                this.nextToken();
                if (this.peekTokenIs(TokenType.RBRACKET)) {
                    this.nextToken();
                    return new AST.ArrayExpression(elements);
                }
                this.nextToken();
            } else {
                break;
            }
        }
        if (!this.expectPeek(TokenType.RBRACKET)) return null;
        return new AST.ArrayExpression(elements);
    }

    parseObjectLiteral() {
        let properties = [];
        if (this.peekTokenIs(TokenType.RBRACE)) {
            this.nextToken();
            return new AST.ObjectExpression(properties);
        }
        this.nextToken();
        while (!this.curTokenIs(TokenType.RBRACE) && !this.curTokenIs(TokenType.EOF)) {
            let computed = false;
            let key;
            if (this.curTokenIs(TokenType.SPREAD)) {
                this.nextToken();
                properties.push(new AST.SpreadElement(this.parseExpression(Precedence.LOWEST)));
                if (this.peekTokenIs(TokenType.COMMA)) {
                    this.nextToken();
                    this.nextToken();
                } else {
                    break;
                }
                continue;
            }
            if (this.curTokenIs(TokenType.LBRACKET)) {
                computed = true;
                this.nextToken();
                key = this.parseExpression(Precedence.LOWEST);
                if (!this.expectPeek(TokenType.RBRACKET)) return null;
            } else if (this.curTokenIs(TokenType.STRING)) {
                key = new AST.Literal(this.curToken.literal, '"' + this.curToken.literal + '"');
            } else {
                key = new AST.Identifier(this.curToken.literal);
            }
            if (this.peekTokenIs(TokenType.COMMA) || this.peekTokenIs(TokenType.RBRACE)) {
                properties.push(new AST.Property(key, key, "init", computed, true));
            } else if (this.peekTokenIs(TokenType.LPAREN)) {
                this.nextToken();
                let params = this.parseFunctionParams();
                if (!this.expectPeek(TokenType.LBRACE)) return null;
                let body = this.parseBlockStatement();
                properties.push(new AST.Property(key, new AST.FunctionExpression(null, params, body, false), "init", computed, false));
            } else {
                if (!this.expectPeek(TokenType.COLON)) return null;
                this.nextToken();
                properties.push(new AST.Property(key, this.parseExpression(Precedence.LOWEST), "init", computed, false));
            }
            if (this.peekTokenIs(TokenType.COMMA)) {
                this.nextToken();
                if (this.peekTokenIs(TokenType.RBRACE)) break;
                this.nextToken();
            } else {
                break;
            }
        }
        if (!this.expectPeek(TokenType.RBRACE)) return null;
        return new AST.ObjectExpression(properties);
    }

    parseFunctionExpression() {
        let isAsync = false;
        if (!this.expectPeek(TokenType.LPAREN)) {
            if (this.peekTokenIs(TokenType.IDENT)) {
                this.nextToken();
                let id = new AST.Identifier(this.curToken.literal);
                if (!this.expectPeek(TokenType.LPAREN)) return null;
                let params = this.parseFunctionParams();
                if (!this.expectPeek(TokenType.LBRACE)) return null;
                return new AST.FunctionExpression(id, params, this.parseBlockStatement(), isAsync);
            }
            return null;
        }
        let params = this.parseFunctionParams();
        if (!this.expectPeek(TokenType.LBRACE)) return null;
        return new AST.FunctionExpression(null, params, this.parseBlockStatement(), isAsync);
    }

    parseAsyncExpression() {
        this.nextToken();
        if (this.curTokenIs(TokenType.FUNCTION)) {
            let func = this.parseFunctionExpression();
            if (func !== null) func.isAsync = true;
            return func;
        }
        if (this.curTokenIs(TokenType.LPAREN)) {
            let arrow = this.parseGroupedOrArrow();
            if (arrow !== null && arrow.type === "ArrowFunctionExpression") {
                arrow.isAsync = true;
            }
            return arrow;
        }
        if (this.curTokenIs(TokenType.IDENT)) {
            let param = new AST.Identifier(this.curToken.literal);
            if (this.peekTokenIs(TokenType.ARROW)) {
                this.nextToken();
                let arrow = this.parseArrowFunctionBody([param]);
                arrow.isAsync = true;
                return arrow;
            }
        }
        return null;
    }

    parseClassExpression() {
        return this.parseClassDeclaration();
    }

    parseThisExpression() {
        return new AST.ThisExpression();
    }
    parseSuperExpression() {
        return new AST.SuperExpression();
    }

    parseSpreadExpression() {
        this.nextToken();
        return new AST.SpreadElement(this.parseExpression(Precedence.LOWEST));
    }

    parseNewExpression() {
        this.nextToken();
        let callee = this.parseExpression(Precedence.MEMBER);
        let args = [];
        if (this.peekTokenIs(TokenType.LPAREN)) {
            this.nextToken();
            args = this.parseCallArguments();
        }
        return new AST.NewExpression(callee, args);
    }

    parseCallExpression(callee) {
        return new AST.CallExpression(callee, this.parseCallArguments());
    }

    parseCallArguments() {
        let args = [];
        if (this.peekTokenIs(TokenType.RPAREN)) {
            this.nextToken();
            return args;
        }
        this.nextToken();
        while (!this.curTokenIs(TokenType.RPAREN) && !this.curTokenIs(TokenType.EOF)) {
            if (this.curTokenIs(TokenType.SPREAD)) {
                this.nextToken();
                args.push(new AST.SpreadElement(this.parseExpression(Precedence.LOWEST)));
            } else {
                args.push(this.parseExpression(Precedence.LOWEST));
            }
            if (this.peekTokenIs(TokenType.COMMA)) {
                this.nextToken();
                this.nextToken();
            } else {
                break;
            }
        }
        if (!this.expectPeek(TokenType.RPAREN)) return null;
        return args;
    }

    parseMemberExpression(object) {
        this.nextToken();
        return new AST.MemberExpression(object, new AST.Identifier(this.curToken.literal), false, false);
    }

    parseOptionalMemberExpression(object) {
        this.nextToken();
        if (!this.curTokenIs(TokenType.IDENT)) {
            this.errors.push("expected identifier after ?.");
            return null;
        }
        return new AST.MemberExpression(object, new AST.Identifier(this.curToken.literal), false, true);
    }

    parseIndexExpression(object) {
        this.nextToken();
        let index = this.parseExpression(Precedence.LOWEST);
        if (!this.expectPeek(TokenType.RBRACKET)) return null;
        return new AST.MemberExpression(object, index, true, false);
    }
}

// 创建解析器
export function newParser(lexer) {
    return new Parser(lexer);
}

// 解析源代码
export function parse(source) {
    let lexer = new Lexer(source);
    let parser = new Parser(lexer);
    return parser.parseProgram();
}
