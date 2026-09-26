const fs = require('fs');
const path = require('path');

function getVersion() {
    if (process.argv[2] && !process.argv[2].startsWith('--')) {
        return process.argv[2].replace(/^v/, '');
    }
    const manifestPath = path.resolve('manifest.json');
    if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        return manifest.version;
    }
    throw new Error('Version not provided and manifest.json not found.');
}

function extractReleaseNotes(version) {
    const changelogPath = path.resolve('CHANGELOG.md');
    if (!fs.existsSync(changelogPath)) {
        return { title: `[${version}]`, notes: '' };
    }

    const changelog = fs.readFileSync(changelogPath, 'utf8');
    const lines = changelog.split(/\r?\n/);

    // Escape dots in version for regex
    const escapedVersion = version.replace(/\./g, '\\.');
    const versionHeaderRegex = new RegExp(`^##\\s+\\[?v?${escapedVersion}\\]?(.*)$`);

    let found = false;
    let title = '';
    const notesLines = [];

    for (const line of lines) {
        if (!found) {
            const match = line.match(versionHeaderRegex);
            if (match) {
                found = true;
                title = line.replace(/^##\s+/, '').trim();
            }
        } else {
            // Stop at the next level-2 heading or horizontal rule
            if (line.match(/^##\s+/) || line.match(/^---$/)) {
                break;
            }
            notesLines.push(line);
        }
    }

    if (!title) {
        title = `[${version}]`;
    }

    const notes = notesLines.join('\n').trim();
    return { title, notes };
}

function main() {
    try {
        const version = getVersion();
        const { title, notes } = extractReleaseNotes(version);

        let writeFileIndex = process.argv.indexOf('--write-file');
        if (writeFileIndex !== -1 && process.argv[writeFileIndex + 1]) {
            const outPath = path.resolve(process.argv[writeFileIndex + 1]);
            fs.writeFileSync(outPath, notes, 'utf8');
            console.log(`✅ Release notes written to: ${outPath}`);
        }

        if (process.env.GITHUB_OUTPUT) {
            fs.appendFileSync(process.env.GITHUB_OUTPUT, `title=${title}\n`, 'utf8');
            fs.appendFileSync(process.env.GITHUB_OUTPUT, `has_notes=${notes.length > 0}\n`, 'utf8');
        }

        console.log(`Title: ${title}`);
        console.log(`Notes Length: ${notes.length} characters`);
    } catch (e) {
        console.error(`❌ Error extracting release notes: ${e.message}`);
        process.exit(1);
    }
}

main();
