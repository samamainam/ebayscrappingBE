const express = require('express');
const puppeteer = require('puppeteer');
const bodyParser = require('body-parser');
const cors = require('cors'); // Import the cors middleware
const { Pool } = require('pg'); // Import the pg library
const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(cors());

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});


// PostgreSQL database configuration
const pool = new Pool({
    connectionString: 'N/A',
    user: 'N/A',
    host: 'N/A',
    database: 'N/A',
    password: 'N/A',
    port: 5432, // Default PostgreSQL port
});



//  Route to scrape products from the Ebay
app.post('/api/scrape-ebay', async (req, res) => {
    try {
        const searchQuery = req.body.value; // Replace with your eBay search query
        console.log(req.body.value);
        const ebayUrl = `https://www.ebay.com/sch/i.html?_nkw=${searchQuery}`;

        const browser = await puppeteer.launch();
        const page = await browser.newPage();

        await page.goto(ebayUrl);

        // Wait for the eBay search results to load completely
        await page.waitForSelector('.s-item');

        const ebay_products = await page.evaluate(() => {
            const productNodes = document.querySelectorAll('.s-item');

            const productList = [];

            let firstEntryRemoved = false; // Flag to track if the first entry has been removed

            productNodes.forEach((productNode) => {
                const product_name = productNode.querySelector('.s-item__title')?.textContent || '';
                const price = productNode.querySelector('.s-item__price')?.textContent || '';
                const link = productNode.querySelector('.s-item__link')?.href || '';

                const imageNodes = productNode.querySelectorAll('.s-item__image');
                const image_url = Array.from(imageNodes).map((imageNode) =>
                    imageNode.querySelector('img')?.getAttribute('src') || ''
                );

                if (!firstEntryRemoved) {
                    // Check if this is the first entry (id=0), and skip it
                    const id = 1; // Replace with the actual logic to get the ID
                    if (id === 1) {
                        firstEntryRemoved = true;
                        return; // Skip this entry
                    }
                }

                productList.push({ product_name, price, link, image_url });
            });

            return productList;
        });


        await browser.close();

        // Insert scraped products into the PostgreSQL database
        await insertProductsIntoDatabase(ebay_products);

        res.json(ebay_products);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'An error occurred while scraping eBay.' });
    }
});

// Function to insert products into the PostgreSQL database
async function insertProductsIntoDatabase(ebay_products) {
    try {
        const client = await pool.connect();
        await client.query('BEGIN');

        // Iterate through the products and insert them into the database
        for (const product of ebay_products) {
            const { product_name, price, link, image_url } = product;
            const queryText = 'INSERT INTO ebay_products (product_name, price, link, image_url) VALUES ($1, $2, $3, $4)';
            const values = [product_name, price, link, JSON.stringify(image_url)];

            await client.query(queryText, values);
        }

        await client.query('COMMIT');
        client.release();
        console.log('Products inserted into the database.');
    } catch (error) {
        console.error('Error inserting products into the database:', error);
    }
}


// Define a route to fetch products from the database
app.get('/api/products', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM ebay_products');
        const products = result.rows;
        client.release();
        res.json(products);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});