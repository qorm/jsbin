// JSBin 解析器 - 语句解析
// 解析 JavaScript 语句

import { TokenType } from "../lexer/token.js";
import * as AST from "./ast.js";
import { Precedence } from "./precedence.js";

// 语句解析混入
export const StatementParser = {
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
    },

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
    },

    parseFunctionDeclaration() {
        let isAsync = false;
        let isGenerator = false;
        if (this.curTokenIs(TokenType.ASYNC)) {
            isAsync = true;
            this.nextToken();
        }
        if (this.peekTokenIs(TokenType.ASTERISK)) {
            isGenerator = true;
            this.nextToken();
        }
        if (!this.expectPeek(TokenType.IDENT)) return null;
        let id = new AST.Identifier(this.curToken.literal);
        if (!this.expectPeek(TokenType.LPAREN)) return null;
        let params = this.parseFunctionParams();
        if (!this.expectPeek(TokenType.LBRACE)) return null;
        let body = this.parseBlockStatement();
        return new AST.FunctionDeclaration(id, params, body, isAsync, isGenerator);
    },

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
    },

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
    },

    parseBlockStatement() {
        let block = new AST.BlockStatement([]);
        this.nextToken();
        while (!this.curTokenIs(TokenType.RBRACE) && !this.curTokenIs(TokenType.EOF)) {
            let stmt = this.parseStatement();
            if (stmt !== null) block.body.push(stmt);
            this.nextToken();
        }
        return block;
    },

    parseReturnStatement() {
        let stmt = new AST.ReturnStatement(null);
        this.nextToken();
        if (!this.curTokenIs(TokenType.SEMICOLON) && !this.curTokenIs(TokenType.RBRACE)) {
            stmt.argument = this.parseExpression(Precedence.LOWEST);
        }
        if (this.peekTokenIs(TokenType.SEMICOLON)) this.nextToken();
        return stmt;
    },

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
    },

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
    },

    parseWhileStatement() {
        if (!this.expectPeek(TokenType.LPAREN)) return null;
        this.nextToken();
        let test = this.parseExpression(Precedence.LOWEST);
        if (!this.expectPeek(TokenType.RPAREN)) return null;
        this.nextToken();
        let body = this.curTokenIs(TokenType.LBRACE) ? this.parseBlockStatement() : this.parseStatement();
        return new AST.WhileStatement(test, body);
    },

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
    },

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
    },

    parseBreakStatement() {
        let label = null;
        if (this.peekTokenIs(TokenType.IDENT)) {
            this.nextToken();
            label = new AST.Identifier(this.curToken.literal);
        }
        if (this.peekTokenIs(TokenType.SEMICOLON)) this.nextToken();
        return new AST.BreakStatement(label);
    },

    parseContinueStatement() {
        let label = null;
        if (this.peekTokenIs(TokenType.IDENT)) {
            this.nextToken();
            label = new AST.Identifier(this.curToken.literal);
        }
        if (this.peekTokenIs(TokenType.SEMICOLON)) this.nextToken();
        return new AST.ContinueStatement(label);
    },

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
    },

    parseThrowStatement() {
        this.nextToken();
        let argument = this.parseExpression(Precedence.LOWEST);
        if (this.peekTokenIs(TokenType.SEMICOLON)) this.nextToken();
        return new AST.ThrowStatement(argument);
    },

    parseExpressionStatement() {
        let expr = this.parseExpression(Precedence.LOWEST);
        if (this.peekTokenIs(TokenType.SEMICOLON)) this.nextToken();
        return new AST.ExpressionStatement(expr);
    },
};
