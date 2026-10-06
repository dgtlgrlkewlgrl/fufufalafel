function emit(level, message, fields = {}) {
    const line = JSON.stringify({
        ts: new Date().toISOString(),
        level,
        message,
        ...fields,
    });
    if (level === "error" || level === "warn") {
        console.error(line);
    }
    else {
        console.log(line);
    }
}
export const logger = {
    debug: (message, fields) => emit("debug", message, fields),
    info: (message, fields) => emit("info", message, fields),
    warn: (message, fields) => emit("warn", message, fields),
    error: (message, fields) => emit("error", message, fields),
};
//# sourceMappingURL=logger.js.map