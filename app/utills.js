function typeOf(value) {
    var type = typeof value;
    if (type === 'object') {
        if (value === null) {
            return 'null';
        } else if (Array.isArray(value)) {
            return 'array';
        }
    }
    return type;
}
const langs = require('langs');
function convertToTwoLetterCode(input) {
    let language;

    // Normalize input and check for hyphenated language-region formats
    input = input.toLowerCase();
    if (input.includes('-')) {
        input = input.split('-')[0];  // Take the first part as the language code
    }

    // Check if it is a valid two-letter code
    if (input.length === 2 && langs.where("1", input)) {
        return input;
    }

    // Convert from three-letter code to two-letter code
    else if (input.length === 3) {
        language = langs.where("3", input);
        return language ? language['1'] : null;
    }

    // Convert from full name to two-letter code
    else {
        language = langs.where("name", input);
        return language ? language['1'] : null;
    }
}
module.exports = {
    typeOf,
    convertToTwoLetterCode
}