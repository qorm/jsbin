// JSBin 解析器 - 表达式解析
// 解析 JavaScript 表达式

import { TokenType } from "../lexer/token.js";
import * as AST from "./ast.js";
import { Precedence } from "./precedence.js";

// 表达式解析混入
export const ExpressionParser = {
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
    },

    parseIdentifier() {
        const ident = new AST.Identifier(this.curToken.literal);
        // 检查是否是无括号单参数箭头函数: x => expr
        if (this.peekTokenIs(TokenType.ARROW)) {
            this.nextToken(); // 消费 =>
            return this.parseArrowFunctionBody([ident]);
        }
        return ident;
    },

    parseNumberLiteral() {
        const raw = this.curToken.literal;
        if (raw.includes(".") || raw.includes("e") || raw.includes("E")) {
            return new AST.Literal(parseFloat(raw), raw);
        } else {
            return new AST.Literal(parseInt(raw), raw);
        }
    },

    parseStringLiteral() {
        return new AST.Literal(this.curToken.literal, '"' + this.curToken.literal + '"');
    },

    parseTemplateLiteral() {
        let quasi = {
            type: "TemplateElement",
            value: { raw: this.curToken.literal, cooked: this.curToken.literal },
            tail: true,
        };
        return new AST.TemplateLiteral([quasi], []);
    },

    parseTemplateLiteralWithExpressions() {
        let quasis = [];
        let expressions = [];

        let firstQuasi = {
            type: "TemplateElement",
            value: { raw: this.curToken.literal, cooked: this.curToken.literal },
            tail: false,
        };
        quasis.push(firstQuasi);

        while (true) {
            this.nextToken();
            let expr = this.parseExpression(Precedence.LOWEST);
            expressions.push(expr);
            this.nextToken();

            let quasi = {
                type: "TemplateElement",
                value: { raw: this.curToken.literal, cooked: this.curToken.literal },
                tail: this.curToken.type === TokenType.TEMPLATE_TAIL,
            };
            quasis.push(quasi);

            if (this.curToken.type === TokenType.TEMPLATE_TAIL) {
                break;
            }
            if (this.curToken.type !== TokenType.TEMPLATE_MIDDLE) {
                this.errors.push("unexpected token in template literal: " + this.curToken.type);
                return null;
            }
        }
        return new AST.TemplateLiteral(quasis, expressions);
    },

    parseBooleanLiteral() {
        return new AST.Literal(this.curTokenIs(TokenType.TRUE), this.curToken.literal);
    },

    parseNullLiteral() {
        return new AST.Literal(null, "null");
    },

    parseUndefinedLiteral() {
        return new AST.Literal(undefined, "undefined");
    },

    parsePrefixExpression() {
        let operator = this.curToken.literal;
        this.nextToken();
        return new AST.UnaryExpression(operator, this.parseExpression(Precedence.PREFIX), true);
    },

    parseAwaitExpression() {
        this.nextToken();
        return new AST.AwaitExpression(this.parseExpression(Precedence.PREFIX));
    },

    parsePrefixUpdateExpression() {
        let operator = this.curToken.literal;
        this.nextToken();
        return new AST.UpdateExpression(operator, this.parseExpression(Precedence.PREFIX), true);
    },

    parsePostfixUpdateExpression(left) {
        return new AST.UpdateExpression(this.curToken.literal, left, false);
    },

    parseBinaryExpression(left) {
        let operator = this.curToken.literal;
        let precedence = this.curPrecedence();
        this.nextToken();
        return new AST.BinaryExpression(operator, left, this.parseExpression(precedence));
    },

    parseLogicalExpression(left) {
        let operator = this.curToken.literal;
        let precedence = this.curPrecedence();
        this.nextToken();
        return new AST.LogicalExpression(operator, left, this.parseExpression(precedence));
    },

    parseAssignmentExpression(left) {
        let operator = this.curToken.literal;
        this.nextToken();
        return new AST.AssignmentExpression(operator, left, this.parseExpression(Precedence.ASSIGN - 1));
    },

    parseConditionalExpression(test) {
        this.nextToken();
        let consequent = this.parseExpression(Precedence.LOWEST);
        if (!this.expectPeek(TokenType.COLON)) return null;
        this.nextToken();
        return new AST.ConditionalExpression(test, consequent, this.parseExpression(Precedence.TERNARY - 1));
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

    parseThisExpression() {
        return new AST.ThisExpression();
    },

    parseSuperExpression() {
        return new AST.SuperExpression();
    },

    parseSpreadExpression() {
        this.nextToken();
        return new AST.SpreadElement(this.parseExpression(Precedence.LOWEST));
    },

    parseNewExpression() {
        this.nextToken();
        let callee = this.parseExpression(Precedence.MEMBER);
        let args = [];
        if (this.peekTokenIs(TokenType.LPAREN)) {
            this.nextToken();
            args = this.parseCallArguments();
        }
        return new AST.NewExpression(callee, args);
    },

    parseCallExpression(callee) {
        return new AST.CallExpression(callee, this.parseCallArguments());
    },

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
    },

    parseMemberExpression(object) {
        this.nextToken();
        // 支持私有字段访问 obj.#field
        if (this.curTokenIs(TokenType.HASH) || (this.curToken.literal && this.curToken.literal.startsWith("#"))) {
            let name = this.curToken.literal;
            if (!name.startsWith("#")) {
                this.nextToken();
                name = "#" + this.curToken.literal;
            }
            return new AST.MemberExpression(object, new AST.PrivateIdentifier(name), false, false);
        }
        return new AST.MemberExpression(object, new AST.Identifier(this.curToken.literal), false, false);
    },

    parseOptionalMemberExpression(object) {
        this.nextToken();
        if (!this.curTokenIs(TokenType.IDENT)) {
            this.errors.push("expected identifier after ?.");
            return null;
        }
        return new AST.MemberExpression(object, new AST.Identifier(this.curToken.literal), false, true);
    },

    parseIndexExpression(object) {
        this.nextToken();
        let index = this.parseExpression(Precedence.LOWEST);
        if (!this.expectPeek(TokenType.RBRACKET)) return null;
        return new AST.MemberExpression(object, index, true, false);
    },

    parseYieldExpression() {
        let delegate = false;
        if (this.peekTokenIs(TokenType.ASTERISK)) {
            delegate = true;
            this.nextToken();
        }
        this.nextToken();
        let argument = null;
        if (!this.curTokenIs(TokenType.SEMICOLON) && !this.curTokenIs(TokenType.RBRACE)) {
            argument = this.parseExpression(Precedence.LOWEST);
        }
        return new AST.YieldExpression(argument, delegate);
    },
};
