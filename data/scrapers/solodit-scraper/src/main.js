import { PuppeteerCrawler, Dataset } from 'crawlee';

const soloditCrawler = new PuppeteerCrawler({
    // We only need to visit the main page once, then click around!
    async requestHandler({ page, request, log }) {
        log.info(`Agent landed on: ${request.url}`);
        
        // 1. Wait for the main list to load
        // We can see from your screenshot the buttons have 'ring-0'
        const buttonSelector = 'button.ring-0'; 
        await page.waitForSelector(buttonSelector); 

        // 2. Find all the buttons on the page
        const cards = await page.$$(buttonSelector);
        log.info(`Found ${cards.length} vulnerability cards. Scraping the top 5...`);

        // 3. Loop through the first 5 buttons, CLICK them, and scrape the right side
        for (let i = 0; i < 5; i++) {
            if (!cards[i]) break;
            
            // The Agent physically clicks the card on the left
            await cards[i].click();
            
            // Wait a brief moment for the right side Svelte animation to finish loading the new text
            await new Promise(r => setTimeout(r, 1500)); 

            // 4. Extract the data from the right-side pane!
            const details = await page.evaluate(() => {
                
                // 1. Grab the Title (Targeting the <a> inside the <h2>)
                const titleEl = document.querySelector('h2 a') || document.querySelector('h2');
                const title = titleEl ? titleEl.innerText.trim() : 'No Title Found';

                // 2. Grab the Description (Targeting the main markdown container)
                const descEl = document.querySelector('.markdown');
                const descriptionText = descEl ? descEl.innerText.trim() : 'No Description Found';
                
                // 3. Grab the actual Solidity Code Snippet!
                const codeEl = document.querySelector('.ql-code-block-container[data-language="solidity"]');
                const codeSnippet = codeEl ? codeEl.innerText.trim() : 'No Code Found';
                
                return {
                    title: title,
                    description: descriptionText,
                    codeSnippet: codeSnippet,
                    scrapedAt: new Date().toISOString()
                };
            });

            log.info(`Scraped: ${details.title}`);
            await Dataset.pushData(details);
        }
    },
});

// Run it on the main page
await soloditCrawler.run(['https://solodit.cyfrin.io/?rf=alltime&sd=Desc&sf=Recency']);