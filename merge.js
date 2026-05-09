import fs from 'fs';
import path from 'path';

// The paths to your local databases
const soloditPath = './scrapers/solodit-scraper/storage/datasets/default';
const immunefiPath = './scrapers/immunefi-scraper/storage/datasets/default';
// Add ESMA here if you got it working: const esmaPath = './scrapers/esma-watchdog/storage/datasets/default';

let combinedData = [];

// Helper function to read folders
function readScrapedData(folderPath) {
    if (fs.existsSync(folderPath)) {
        const files = fs.readdirSync(folderPath);
        files.forEach(file => {
            if (file.endsWith('.json')) {
                const data = JSON.parse(fs.readFileSync(path.join(folderPath, file)));
                combinedData.push(data);
            }
        });
        console.log(`✅ Merged data from ${folderPath}`);
    } else {
        console.log(`⚠️ Could not find folder: ${folderPath}`);
    }
}

// Merge them!
readScrapedData(soloditPath);
readScrapedData(immunefiPath);

// Save the massive brain file
fs.writeFileSync('./knowledge_base.json', JSON.stringify(combinedData, null, 2));
console.log('🧠 BRAIN MERGER COMPLETE! Saved to knowledge_base.json');