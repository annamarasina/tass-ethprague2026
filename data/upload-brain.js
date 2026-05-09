import { Bee } from '@ethersphere/bee-js';
import fs from 'fs';

// 1. Use the new specialized gateway
const bee = new Bee('https://bzz.limo');

// 2. Use your gift code here. 
// If it fails, replace it with: '0000000000000000000000000000000000000000000000000000000000000000'
const POSTAGE_BATCH_ID = '0000000000000000000000000000000000000000000000000000000000000000'; 

async function uploadBrain() {
    try {
        console.log('📖 Reading knowledge_base.json...');
        const data = fs.readFileSync('./knowledge_base.json');

        console.log('🐝 Uploading to Swarm via bzz.limo...');
        // We upload as "Data" to get a clean hash for verification later
        const result = await bee.uploadData(POSTAGE_BATCH_ID, data);
        
        console.log('✅ UPLOAD SUCCESSFUL!');
        console.log('--------------------------------------------------');
        console.log('🧠 SWARM HASH:');
        console.log(result.reference);
        console.log('--------------------------------------------------');
        console.log('Copy this hash. This is your "Brain Address".');
    } catch (error) {
        console.error('❌ Upload failed:', error.message);
    }
}

uploadBrain();