const bcrypt = require('bcrypt');
console.log("Hashing...");
bcrypt.hash('test', 10).then(h => console.log("Done:", h)).catch(e => console.log("Err:", e));
