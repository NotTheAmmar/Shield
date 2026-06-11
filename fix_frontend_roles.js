const fs = require('fs');
const path = require('path');

function replaceRoles(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            replaceRoles(fullPath);
        } else if (fullPath.endsWith('.jsx')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let newContent = content
                .replace(/'Police Officer'/g, "'police_officer'")
                .replace(/'Judicial Authority'/g, "'judicial_authority'")
                .replace(/'Admin'/g, "'admin'");
            
            if (content !== newContent) {
                fs.writeFileSync(fullPath, newContent);
                console.log('Fixed', fullPath);
            }
        }
    }
}

replaceRoles(path.join(__dirname, 'shield-frontend', 'src'));
