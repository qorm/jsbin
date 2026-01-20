// JSBin - JavaScript 词法单元定义
// Token 类型和关键字映射

// Token 类型常量
export const TokenType = {
    // 特殊标记
    ILLEGAL: "ILLEGAL",
    EOF: "EOF",

    // 标识符和字面量
    IDENT: "IDENT",
    INT: "INT",
    FLOAT: "FLOAT",
    STRING: "STRING",
    REGEX: "REGEX",
    TEMPLATE_STRING: "TEMPLATE_STRING",
    TEMPLATE_HEAD: "TEMPLATE_HEAD", // `...${
    TEMPLATE_MIDDLE: "TEMPLATE_MIDDLE", // }...${
    TEMPLATE_TAIL: "TEMPLATE_TAIL", // }...`

    // 运算符
    ASSIGN: "=",
    PLUS: "+",
    MINUS: "-",
    BANG: "!",
    ASTERISK: "*",
    SLASH: "/",
    PERCENT: "%",
    POWER: "**",

    // 比较运算符
    LT: "<",
    GT: ">",
    EQ: "==",
    NOT_EQ: "!=",
    LTE: "<=",
    GTE: ">=",
    STRICT_EQ: "===",
    STRICT_NOT_EQ: "!==",

    // 逻辑运算符
    AND: "&&",
    OR: "||",
    NULLISH: "??",

    // 位运算符
    BITAND: "&",
    BITOR: "|",
    BITXOR: "^",
    BITNOT: "~",
    LSHIFT: "<<",
    RSHIFT: ">>",
    URSHIFT: ">>>",

    // 复合赋值
    PLUS_ASSIGN: "+=",
    MINUS_ASSIGN: "-=",
    ASTERISK_ASSIGN: "*=",
    SLASH_ASSIGN: "/=",
    PERCENT_ASSIGN: "%=",
    AND_ASSIGN: "&=",
    OR_ASSIGN: "|=",
    XOR_ASSIGN: "^=",
    LSHIFT_ASSIGN: "<<=",
    RSHIFT_ASSIGN: ">>=",

    // 逻辑赋值 (ES2021)
    LOGICAL_AND_ASSIGN: "&&=",
    LOGICAL_OR_ASSIGN: "||=",
    NULLISH_ASSIGN: "??=",

    // 自增自减
    INCREMENT: "++",
    DECREMENT: "--",

    // 分隔符
    COMMA: ",",
    SEMICOLON: ";",
    COLON: ":",
    DOT: ".",
    QUESTION: "?",
    ARROW: "=>",
    SPREAD: "...",
    OPTIONAL: "?.",
    HASH: "#", // 私有字段前缀

    // 括号
    LPAREN: "(",
    RPAREN: ")",
    LBRACE: "{",
    RBRACE: "}",
    LBRACKET: "[",
    RBRACKET: "]",

    // 关键字
    FUNCTION: "FUNCTION",
    LET: "LET",
    CONST: "CONST",
    VAR: "VAR",
    TRUE: "TRUE",
    FALSE: "FALSE",
    IF: "IF",
    ELSE: "ELSE",
    RETURN: "RETURN",
    FOR: "FOR",
    WHILE: "WHILE",
    DO: "DO",
    SWITCH: "SWITCH",
    CASE: "CASE",
    DEFAULT: "DEFAULT",
    BREAK: "BREAK",
    CONTINUE: "CONTINUE",
    NULL: "NULL",
    UNDEFINED: "UNDEFINED",
    THIS: "THIS",
    NEW: "NEW",
    CLASS: "CLASS",
    EXTENDS: "EXTENDS",
    SUPER: "SUPER",
    STATIC: "STATIC",
    GET: "GET",
    SET: "SET",
    IMPORT: "IMPORT",
    EXPORT: "EXPORT",
    FROM: "FROM",
    AS: "AS",
    ASYNC: "ASYNC",
    AWAIT: "AWAIT",
    YIELD: "YIELD",
    TRY: "TRY",
    CATCH: "CATCH",
    FINALLY: "FINALLY",
    THROW: "THROW",
    TYPEOF: "TYPEOF",
    INSTANCEOF: "INSTANCEOF",
    IN: "IN",
    OF: "OF",
    DELETE: "DELETE",
    VOID: "VOID",
    INT_TYPE: "INT_TYPE", // int 类型声明关键字
};

// 关键字映射
const keywords = {
    function: TokenType.FUNCTION,
    let: TokenType.LET,
    const: TokenType.CONST,
    var: TokenType.VAR,
    true: TokenType.TRUE,
    false: TokenType.FALSE,
    if: TokenType.IF,
    else: TokenType.ELSE,
    return: TokenType.RETURN,
    for: TokenType.FOR,
    while: TokenType.WHILE,
    do: TokenType.DO,
    switch: TokenType.SWITCH,
    case: TokenType.CASE,
    default: TokenType.DEFAULT,
    break: TokenType.BREAK,
    continue: TokenType.CONTINUE,
    null: TokenType.NULL,
    undefined: TokenType.UNDEFINED,
    this: TokenType.THIS,
    new: TokenType.NEW,
    class: TokenType.CLASS,
    extends: TokenType.EXTENDS,
    super: TokenType.SUPER,
    static: TokenType.STATIC,
    get: TokenType.GET,
    set: TokenType.SET,
    import: TokenType.IMPORT,
    export: TokenType.EXPORT,
    from: TokenType.FROM,
    as: TokenType.AS,
    async: TokenType.ASYNC,
    await: TokenType.AWAIT,
    yield: TokenType.YIELD,
    try: TokenType.TRY,
    catch: TokenType.CATCH,
    finally: TokenType.FINALLY,
    throw: TokenType.THROW,
    typeof: TokenType.TYPEOF,
    instanceof: TokenType.INSTANCEOF,
    in: TokenType.IN,
    of: TokenType.OF,
    delete: TokenType.DELETE,
    void: TokenType.VOID,
    int: TokenType.INT_TYPE,
};

// 查找标识符是否为关键字
export function lookupIdent(ident) {
    if (Object.prototype.hasOwnProperty.call(keywords, ident)) {
        return keywords[ident];
    }
    return TokenType.IDENT;
}

// Token 类
export class Token {
    constructor(type, literal, line, column) {
        this.type = type;
        this.literal = literal;
        this.line = line;
        this.column = column;
    }
}

// 创建 Token
export function newToken(type, literal, line, column) {
    return new Token(type, literal, line, column);
}
