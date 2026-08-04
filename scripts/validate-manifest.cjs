const fs = require('fs');

try {
    const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

    if (manifest.version !== pkg.version) {
        console.error(`❌ Version mismatch: manifest.json (${manifest.version}) !== package.json (${pkg.version})`);
        process.exit(1);
    }

    const requiredFields = ['id', 'name', 'version', 'minAppVersion', 'description', 'author'];
    for (const field of requiredFields) {
        if (!manifest[field]) {
            console.error(`❌ Missing required field in manifest.json: ${field}`);
            process.exit(1);
        }
    }

    console.log('✅ manifest.json is valid and matches package.json version.');
} catch (e) {
    console.error(`❌ Error validating manifest.json: ${e.message}`);
    process.exit(1);
}
