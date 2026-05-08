import { PuppeteerCrawler, Dataset } from 'crawlee';

const soloditCrawler = new PuppeteerCrawler({
    async requestHandler({ page, request, log }) {
        log.info(`Scraping Solodit: ${request.url}`);
        
        // 1. Wait for the list on the left to load
        // (Replace '.list-item-class' with the actual class you found in Step 1)
        await page.waitForSelector('.list-item-class'); 

        // 2. Find all the links to the vulnerabilities in the left column
        const vulnerabilityLinks = await page.$$eval('.list-item-class a', links => links.map(a => a.href));

        // 3. Visit the first 5 links to get the detailed data from the right side!
        for (let i = 0; i < 5; i++) {
            if (!vulnerabilityLinks[i]) break;
            
            await page.goto(vulnerabilityLinks[i]);
            
            // Wait for the right-side detail pane to load
            // (Replace '.detail-title-class' with what you found in Step 2)
            await page.waitForSelector('.detail-title-class');

            // Extract the juicy details
            const details = await page.evaluate(() => {
                return {
                    title: document.querySelector('.detail-title-class')?.innerText || '',
                    description: document.querySelector('.detail-description-class')?.innerText || '',
                    codeSnippet: document.querySelector('.solidity-code-block-class')?.innerText || '',
                    source: window.location.href
                };
            });

            await Dataset.pushData(details);
        }
    },
});