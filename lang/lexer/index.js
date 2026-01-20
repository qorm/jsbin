// JSBin - JavaScript 词法分析器
// 将源代码转换为词法单元流

import { TokenType, newToken, lookupIdent } from "./token.js";

// 词法分析器类
export class Lexer {
    constructor(input) {
        this.input = input;
        this.position = 0;
        this.readPosition = 0;
        this.ch = "";
        this.line = 1;
        this.column = 0;
        this.templateDepth = 0; // 跟踪模板字符串嵌套深度
        this.readChar();
    }

    // 读取下一个字符
    readChar() {
        if (this.readPosition >= this.input.length) {
            this.ch = "\0";
        } else {
            this.ch = this.input[this.readPosition];
        }
        this.position = this.readPosition;
        this.readPosition = this.readPosition + 1;
        this.column = this.column + 1;
        if (this.ch === "\n") {
            this.line = this.line + 1;
            this.column = 0;
        }
    }

    // 查看下一个字符
    peekChar() {
        if (this.readPosition >= this.input.length) {
            return "\0";
        }
        return this.input[this.readPosition];
    }

    // 查看后面第 n 个字符
    peekCharN(n) {
        let pos = this.readPosition + n - 1;
        if (pos >= this.input.length) {
            return "\0";
        }
        return this.input[pos];
    }

    // 跳过空白字符
    skipWhitespace() {
        while (this.ch === " " || this.ch === "\t" || this.ch === "\n" || this.ch === "\r") {
            this.readChar();
        }
    }

    // 跳过注释
    skipComment() {
        while (true) {
            if (this.ch === "/") {
                if (this.peekChar() === "/") {
                    // 单行注释
                    while (this.ch !== "\n" && this.ch !== "\0") {
                        this.readChar();
                    }
                    this.skipWhitespace();
                } else if (this.peekChar() === "*") {
                    // 多行注释
                    this.readChar();
                    this.readChar();
                    while (!(this.ch === "*" && this.peekChar() === "/") && this.ch !== "\0") {
                        this.readChar();
                    }
                    if (this.ch !== "\0") {
                        this.readChar();
                        this.readChar();
                    }
                    this.skipWhitespace();
                } else {
                    break;
                }
            } else {
                break;
            }
        }
    }

    // 读取标识符
    readIdentifier() {
        let startPos = this.position;
        while (this.isLetter(this.ch) || this.isDigit(this.ch)) {
            this.readChar();
        }
        return this.input.slice(startPos, this.position);
    }

    // 读取数字
    readNumber() {
        let startPos = this.position;

        // 处理十六进制、八进制、二进制
        if (this.ch === "0") {
            let next = this.peekChar();
            if (next === "x" || next === "X") {
                this.readChar();
                this.readChar();
                while (this.isHexDigit(this.ch) || this.ch === "_") {
                    this.readChar();
                }
                // 移除数字分隔符后返回
                return this.input.slice(startPos, this.position).replace(/_/g, "");
            } else if (next === "b" || next === "B") {
                this.readChar();
                this.readChar();
                while (this.ch === "0" || this.ch === "1" || this.ch === "_") {
                    this.readChar();
                }
                return this.input.slice(startPos, this.position).replace(/_/g, "");
            } else if (next === "o" || next === "O") {
                this.readChar();
                this.readChar();
                while ((this.ch >= "0" && this.ch <= "7") || this.ch === "_") {
                    this.readChar();
                }
                return this.input.slice(startPos, this.position).replace(/_/g, "");
            }
        }

        // 整数部分 (支持数字分隔符 _)
        while (this.isDigit(this.ch) || this.ch === "_") {
            this.readChar();
        }

        // 小数部分
        if (this.ch === "." && this.isDigit(this.peekChar())) {
            this.readChar();
            while (this.isDigit(this.ch) || this.ch === "_") {
                this.readChar();
            }
        }

        // 指数部分
        if (this.ch === "e" || this.ch === "E") {
            this.readChar();
            if (this.ch === "+" || this.ch === "-") {
                this.readChar();
            }
            while (this.isDigit(this.ch) || this.ch === "_") {
                this.readChar();
            }
        }

        // 移除数字分隔符后返回
        return this.input.slice(startPos, this.position).replace(/_/g, "");
    }

    // 读取字符串
    readString(quote) {
        let result = "";
        this.readChar(); // 跳过开始引号

        while (this.ch !== quote && this.ch !== "\0") {
            if (this.ch === "\\") {
                this.readChar();
                if (this.ch === "n") {
                    result = result + "\n";
                } else if (this.ch === "t") {
                    result = result + "\t";
                } else if (this.ch === "r") {
                    result = result + "\r";
                } else if (this.ch === "\\") {
                    result = result + "\\";
                } else if (this.ch === '"') {
                    result = result + '"';
                } else if (this.ch === "'") {
                    result = result + "'";
                } else {
                    result = result + this.ch;
                }
            } else {
                result = result + this.ch;
            }
            this.readChar();
        }

        this.readChar(); // 跳过结束引号
        return result;
    }

    // 读取模板字符串内容（从当前位置读到 ` 或 ${）
    // 返回 { value, isEnd } 其中 isEnd 为 true 表示遇到 `，false 表示遇到 ${
    readTemplateContent() {
        let result = "";

        while (this.ch !== "`" && this.ch !== "\0") {
            // 检查 ${
            if (this.ch === "$" && this.peekChar() === "{") {
                this.readChar(); // 跳过 $
                this.readChar(); // 跳过 {
                return { value: result, isEnd: false };
            }

            if (this.ch === "\\") {
                this.readChar();
                if (this.ch === "n") {
                    result = result + "\n";
                } else if (this.ch === "t") {
                    result = result + "\t";
                } else if (this.ch === "r") {
                    result = result + "\r";
                } else if (this.ch === "\\") {
                    result = result + "\\";
                } else if (this.ch === "`") {
                    result = result + "`";
                } else if (this.ch === "$") {
                    result = result + "$";
                } else {
                    result = result + this.ch;
                }
            } else {
                result = result + this.ch;
            }
            this.readChar();
        }

        this.readChar(); // 跳过结束的反引号
        return { value: result, isEnd: true };
    }

    // 读取模板字符串（从 ` 开始）
    // 返回 { type, value }
    // type: TEMPLATE_STRING (无插值) 或 TEMPLATE_HEAD (有插值)
    readTemplateString() {
        this.readChar(); // 跳过开始的反引号
        let { value, isEnd } = this.readTemplateContent();

        if (isEnd) {
            return { type: TokenType.TEMPLATE_STRING, value };
        } else {
            this.templateDepth = this.templateDepth + 1;
            return { type: TokenType.TEMPLATE_HEAD, value };
        }
    }

    // 从 } 继续读取模板字符串（在表达式之后）
    // 返回 { type, value }
    // type: TEMPLATE_TAIL (遇到 `) 或 TEMPLATE_MIDDLE (遇到另一个 ${)
    readTemplateMiddle() {
        let { value, isEnd } = this.readTemplateContent();

        if (isEnd) {
            this.templateDepth = this.templateDepth - 1;
            return { type: TokenType.TEMPLATE_TAIL, value };
        } else {
            return { type: TokenType.TEMPLATE_MIDDLE, value };
        }
    }

    // 判断是否为字母
    isLetter(ch) {
        let code = ch.charCodeAt(0);
        return (code >= 97 && code <= 122) || (code >= 65 && code <= 90) || code === 95 || code === 36;
    }

    // 判断是否为数字
    isDigit(ch) {
        let code = ch.charCodeAt(0);
        return code >= 48 && code <= 57;
    }

    // 判断是否为十六进制数字
    isHexDigit(ch) {
        let code = ch.charCodeAt(0);
        return this.isDigit(ch) || (code >= 97 && code <= 102) || (code >= 65 && code <= 70);
    }

    // 获取下一个 Token
    nextToken() {
        let tok;

        this.skipWhitespace();
        this.skipComment();
        this.skipWhitespace();

        let startLine = this.line;
        let startColumn = this.column;

        if (this.ch === "=") {
            if (this.peekChar() === "=") {
                this.readChar();
                if (this.peekChar() === "=") {
                    this.readChar();
                    tok = newToken(TokenType.STRICT_EQ, "===", startLine, startColumn);
                } else {
                    tok = newToken(TokenType.EQ, "==", startLine, startColumn);
                }
            } else if (this.peekChar() === ">") {
                this.readChar();
                tok = newToken(TokenType.ARROW, "=>", startLine, startColumn);
            } else {
                tok = newToken(TokenType.ASSIGN, "=", startLine, startColumn);
            }
        } else if (this.ch === "+") {
            if (this.peekChar() === "+") {
                this.readChar();
                tok = newToken(TokenType.INCREMENT, "++", startLine, startColumn);
            } else if (this.peekChar() === "=") {
                this.readChar();
                tok = newToken(TokenType.PLUS_ASSIGN, "+=", startLine, startColumn);
            } else {
                tok = newToken(TokenType.PLUS, "+", startLine, startColumn);
            }
        } else if (this.ch === "-") {
            if (this.peekChar() === "-") {
                this.readChar();
                tok = newToken(TokenType.DECREMENT, "--", startLine, startColumn);
            } else if (this.peekChar() === "=") {
                this.readChar();
                tok = newToken(TokenType.MINUS_ASSIGN, "-=", startLine, startColumn);
            } else {
                tok = newToken(TokenType.MINUS, "-", startLine, startColumn);
            }
        } else if (this.ch === "!") {
            if (this.peekChar() === "=") {
                this.readChar();
                if (this.peekChar() === "=") {
                    this.readChar();
                    tok = newToken(TokenType.STRICT_NOT_EQ, "!==", startLine, startColumn);
                } else {
                    tok = newToken(TokenType.NOT_EQ, "!=", startLine, startColumn);
                }
            } else {
                tok = newToken(TokenType.BANG, "!", startLine, startColumn);
            }
        } else if (this.ch === "/") {
            if (this.peekChar() === "=") {
                this.readChar();
                tok = newToken(TokenType.SLASH_ASSIGN, "/=", startLine, startColumn);
            } else {
                tok = newToken(TokenType.SLASH, "/", startLine, startColumn);
            }
        } else if (this.ch === "*") {
            if (this.peekChar() === "*") {
                this.readChar();
                tok = newToken(TokenType.POWER, "**", startLine, startColumn);
            } else if (this.peekChar() === "=") {
                this.readChar();
                tok = newToken(TokenType.ASTERISK_ASSIGN, "*=", startLine, startColumn);
            } else {
                tok = newToken(TokenType.ASTERISK, "*", startLine, startColumn);
            }
        } else if (this.ch === "%") {
            if (this.peekChar() === "=") {
                this.readChar();
                tok = newToken(TokenType.PERCENT_ASSIGN, "%=", startLine, startColumn);
            } else {
                tok = newToken(TokenType.PERCENT, "%", startLine, startColumn);
            }
        } else if (this.ch === "<") {
            if (this.peekChar() === "=") {
                this.readChar();
                tok = newToken(TokenType.LTE, "<=", startLine, startColumn);
            } else if (this.peekChar() === "<") {
                this.readChar();
                if (this.peekChar() === "=") {
                    this.readChar();
                    tok = newToken(TokenType.LSHIFT_ASSIGN, "<<=", startLine, startColumn);
                } else {
                    tok = newToken(TokenType.LSHIFT, "<<", startLine, startColumn);
                }
            } else {
                tok = newToken(TokenType.LT, "<", startLine, startColumn);
            }
        } else if (this.ch === ">") {
            if (this.peekChar() === "=") {
                this.readChar();
                tok = newToken(TokenType.GTE, ">=", startLine, startColumn);
            } else if (this.peekChar() === ">") {
                this.readChar();
                if (this.peekChar() === ">") {
                    this.readChar();
                    tok = newToken(TokenType.URSHIFT, ">>>", startLine, startColumn);
                } else if (this.peekChar() === "=") {
                    this.readChar();
                    tok = newToken(TokenType.RSHIFT_ASSIGN, ">>=", startLine, startColumn);
                } else {
                    tok = newToken(TokenType.RSHIFT, ">>", startLine, startColumn);
                }
            } else {
                tok = newToken(TokenType.GT, ">", startLine, startColumn);
            }
        } else if (this.ch === "&") {
            if (this.peekChar() === "&") {
                this.readChar();
                if (this.peekChar() === "=") {
                    this.readChar();
                    tok = newToken(TokenType.LOGICAL_AND_ASSIGN, "&&=", startLine, startColumn);
                } else {
                    tok = newToken(TokenType.AND, "&&", startLine, startColumn);
                }
            } else if (this.peekChar() === "=") {
                this.readChar();
                tok = newToken(TokenType.AND_ASSIGN, "&=", startLine, startColumn);
            } else {
                tok = newToken(TokenType.BITAND, "&", startLine, startColumn);
            }
        } else if (this.ch === "|") {
            if (this.peekChar() === "|") {
                this.readChar();
                if (this.peekChar() === "=") {
                    this.readChar();
                    tok = newToken(TokenType.LOGICAL_OR_ASSIGN, "||=", startLine, startColumn);
                } else {
                    tok = newToken(TokenType.OR, "||", startLine, startColumn);
                }
            } else if (this.peekChar() === "=") {
                this.readChar();
                tok = newToken(TokenType.OR_ASSIGN, "|=", startLine, startColumn);
            } else {
                tok = newToken(TokenType.BITOR, "|", startLine, startColumn);
            }
        } else if (this.ch === "^") {
            if (this.peekChar() === "=") {
                this.readChar();
                tok = newToken(TokenType.XOR_ASSIGN, "^=", startLine, startColumn);
            } else {
                tok = newToken(TokenType.BITXOR, "^", startLine, startColumn);
            }
        } else if (this.ch === "~") {
            tok = newToken(TokenType.BITNOT, "~", startLine, startColumn);
        } else if (this.ch === "?") {
            if (this.peekChar() === ".") {
                this.readChar();
                tok = newToken(TokenType.OPTIONAL, "?.", startLine, startColumn);
            } else if (this.peekChar() === "?") {
                this.readChar();
                if (this.peekChar() === "=") {
                    this.readChar();
                    tok = newToken(TokenType.NULLISH_ASSIGN, "??=", startLine, startColumn);
                } else {
                    tok = newToken(TokenType.NULLISH, "??", startLine, startColumn);
                }
            } else {
                tok = newToken(TokenType.QUESTION, "?", startLine, startColumn);
            }
        } else if (this.ch === ",") {
            tok = newToken(TokenType.COMMA, ",", startLine, startColumn);
        } else if (this.ch === ";") {
            tok = newToken(TokenType.SEMICOLON, ";", startLine, startColumn);
        } else if (this.ch === ":") {
            tok = newToken(TokenType.COLON, ":", startLine, startColumn);
        } else if (this.ch === ".") {
            if (this.peekChar() === "." && this.peekCharN(2) === ".") {
                this.readChar();
                this.readChar();
                tok = newToken(TokenType.SPREAD, "...", startLine, startColumn);
            } else {
                tok = newToken(TokenType.DOT, ".", startLine, startColumn);
            }
        } else if (this.ch === "(") {
            tok = newToken(TokenType.LPAREN, "(", startLine, startColumn);
        } else if (this.ch === ")") {
            tok = newToken(TokenType.RPAREN, ")", startLine, startColumn);
        } else if (this.ch === "{") {
            tok = newToken(TokenType.LBRACE, "{", startLine, startColumn);
        } else if (this.ch === "}") {
            // 检查是否在模板字符串中
            if (this.templateDepth > 0) {
                this.readChar(); // 跳过 }
                let { type, value } = this.readTemplateMiddle();
                return newToken(type, value, startLine, startColumn);
            }
            tok = newToken(TokenType.RBRACE, "}", startLine, startColumn);
        } else if (this.ch === "[") {
            tok = newToken(TokenType.LBRACKET, "[", startLine, startColumn);
        } else if (this.ch === "]") {
            tok = newToken(TokenType.RBRACKET, "]", startLine, startColumn);
        } else if (this.ch === "#") {
            // 私有字段: #name
            this.readChar(); // 跳过 #
            if (this.isLetter(this.ch)) {
                let ident = this.readIdentifier();
                return newToken(TokenType.IDENT, "#" + ident, startLine, startColumn);
            }
            tok = newToken(TokenType.HASH, "#", startLine, startColumn);
        } else if (this.ch === '"' || this.ch === "'") {
            let str = this.readString(this.ch);
            return newToken(TokenType.STRING, str, startLine, startColumn);
        } else if (this.ch === "`") {
            let { type, value } = this.readTemplateString();
            return newToken(type, value, startLine, startColumn);
        } else if (this.ch === "\0") {
            tok = newToken(TokenType.EOF, "", startLine, startColumn);
        } else if (this.isLetter(this.ch)) {
            let ident = this.readIdentifier();
            let type = lookupIdent(ident);
            return newToken(type, ident, startLine, startColumn);
        } else if (this.isDigit(this.ch)) {
            let num = this.readNumber();
            let type = TokenType.INT;
            if (num.includes(".") || num.includes("e") || num.includes("E")) {
                type = TokenType.FLOAT;
            }
            return newToken(type, num, startLine, startColumn);
        } else {
            tok = newToken(TokenType.ILLEGAL, this.ch, startLine, startColumn);
        }

        this.readChar();
        return tok;
    }
}

// 创建词法分析器
export function newLexer(input) {
    return new Lexer(input);
}
