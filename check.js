const fs = require('fs');
try {
    const code = fs.readFileSync('app.js', 'utf8');
    // Simple eval or parsing
    new Function(code);
    console.log("No syntax errors");
} catch (e) {
    console.error("Syntax error:", e);
}
