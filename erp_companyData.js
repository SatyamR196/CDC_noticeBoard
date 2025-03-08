import puppeteer from 'puppeteer';
import dotenv from 'dotenv';
import get_OTP from './fetch_gmail.js';
import fs from 'fs';
import axios from 'axios';

dotenv.config();

let Q_A = {
    [process.env.SQ1] : process.env.A1,
    [process.env.SQ2] : process.env.A2,
    [process.env.SQ3] : process.env.A3,
};

(async () => {
    const browser = await puppeteer.launch({ headless: false,args: ['--start-maximized']});  // Set headless to false for debugging
    const page = await browser.newPage();

    // Get the screen dimensions from Puppeteer
    const { width, height } = await page.evaluate(() => ({
        width: window.screen.width,
        height: window.screen.height
    }));

    // Set the viewport to match the full screen size
    await page.setViewport({ width, height });

    // Navigate to the ERP login page
    await page.goto('https://erp.iitkgp.ac.in/', { waitUntil: 'networkidle2' });


    // Enter the login credentials (Replace 'your_username' and 'your_password' accordingly)
    // await new Promise(resolve => setTimeout(resolve, 1000)) ;
    await page.waitForSelector('input[name="user_id"]', { visible: true }); // Wait for the username field to load
    await page.type('input[name="user_id"]', process.env.ERP_USERNAME); // Replace with actual selector
    await new Promise(resolve => setTimeout(resolve, 3000)) ;
    await page.type('input[name="password"]', process.env.ERP_PASSWORD); // Replace with actual selector
    // await new Promise(resolve => setTimeout(resolve, 3000)) ;
    // Step 2: Wait for the security question to load

    // await page.waitForSelector('label[for="answer"]', { timeout: 10000 }); // not working as before loading innertext this goes forward
    await page.waitForFunction(() => {// This fxn will stop execution till both selector and innertext is loaded.
        const label = document.querySelector('label[for="answer"]');
        return label && label.innerText.trim().length > 0;
    }, { timeout: 10000 });
    
    console.log("✅ Security question label found! Running evaluate...");
    // await new Promise(resolve => setTimeout(resolve, 1000)) 
    // Step 3: Get the security question text

    const securityQuestion = await page.evaluate(() => {
        console.log("C",document.querySelector('label[for="answer"]').innerText);
        return document.querySelector('label[for="answer"]').innerText;
    });

    console.log("Security Question:", securityQuestion);
    // Step 4: Determine the correct answer from .env
    let answer = Q_A[securityQuestion]; // Get the answer from the object
    console.log("Answer=",answer);

    if (!answer) {
        console.error("Security Question not recognized!");
        await browser.close();
        return;
    }
    
    // Step 5: Enter the answer and submit
    await page.type('input[name="answer"]', answer);
    // await new Promise(resolve => setTimeout(resolve, 5000)) 

    page.on('dialog', async dialog => {
        console.log("Popup Message:", dialog.message()); // Log the popup message
        await dialog.accept(); // Click 'OK' to close the popup
    });

    // Click the "Send OTP" button
    await page.click('#getotp'); // Replace with the correct selector if needed

    console.log("OTP sent! Enter it manually to proceed.");

    await new Promise(resolve => setTimeout(resolve, 11000)) 

    let OTP = await get_OTP(); // Get OTP from email (or any other method)
    console.log("OTP:", OTP);
    
    await page.type('input[name="email_otp"]', OTP);

    // Click the login/submit button (Find the correct selector for OTP submission)
    await page.click('#loginFormSubmitButton'); // Replace with the correct selector if needed // Replace with actual selector

    console.log("Logged in successfully!");

    // -------------------------------------------AFTER LOGIN-------------------------------------------
    
    // await new Promise(resolve => setTimeout(resolve, 10000)) 
    await page.waitForSelector('a', { visible: true }); // Wait for all links to load
    await new Promise(resolve => setTimeout(resolve, 10000)) 
    await page.evaluate(() => {
        const cdcLink = Array.from(document.querySelectorAll('a'))
            .find(a => a.innerText.trim() === 'CDC');
        if (cdcLink) cdcLink.click();
    });

    console.log("✅ Clicked on CDC link!");

    // Wait for CDC page to load (modify selector accordingly)
    await page.waitForNavigation();

    console.log("✅ CDC page loaded successfully!");
    await new Promise(resolve => setTimeout(resolve, 2000)) 
    await page.click('.panel-heading');
    
    await new Promise(resolve => setTimeout(resolve, 2000)) 
    await page.locator('.panel-body ::-p-text(Application of Placement/Internship)').click();
    
    await page.waitForNavigation();
    // await new Promise(resolve => setTimeout(resolve, 10000)) 
    // await page.waitForSelector('table');
    await new Promise(resolve => setTimeout(resolve, 10000)) 
    console.log(11);

    // 3. Wait for the iframe to load
    await page.waitForSelector('iframe#myframe'); // Replace with your iframe's selector

    // 4. Get the iframe element
    const iframeHandle = await page.$('iframe#myframe'); // Select the iframe

    // 5. Get the content of the iframe (its document)
    const frame = await iframeHandle.contentFrame();
    let companyData ;
    if (frame) {
        // 6. Wait for the table inside the iframe to load
        await frame.waitForSelector('table'); // Adjust the selector if needed
        // document.querySelectorAll('#grid37 tr')
        // 7. Extract table rows

        const fileElement = await frame.waitForSelector('#grid37');
        await fileElement.screenshot({
            path: 'Table.png',
        });
        await frame.waitForSelector('table tr');
        await new Promise(resolve => setTimeout(resolve, 11000))
        // await frame.mouse.wheel({ deltaY: 500 });
        // Get the viewport dimensions
        const viewport = page.viewport();
        const x = viewport.width / 2; // X-coordinate (horizontal center)
        const y = viewport.height / 2; // Y-coordinate (vertical center)
        // Move the mouse to the center of the page
        await page.mouse.move(x, y);

        // Optionally: Perform scroll or any action at the center
        await page.mouse.wheel({ deltaY: 2000 });
        await new Promise(resolve => setTimeout(resolve, 5000))
        await page.mouse.wheel({ deltaY: 2000 });
        await page.mouse.move(0, 200);
        await new Promise(resolve => setTimeout(resolve, 5000))

        companyData = await frame.evaluate(() => {
            // const tableContainer = document.querySelector('#grid37');
            console.log("inside evaluate");
            const tableContainer = document.querySelector('#grid37');
            let All_data = [];
            // console.log(tableContainer);
            // tableContainer.scrollBy(0, 500); // Scroll down
            const rows = Array.from(document.querySelectorAll('#grid37 tr'));
            return rows.map(row => {
                return Array.from(row.querySelectorAll('td, th')).map(cell => cell.innerText.trim());
            });
        });

        // 8. Print the extracted table data
        console.log(companyData);
    } else {
        console.log("Failed to access iframe content.");
    }
    console.log("✅ Table found",companyData[1]);
//-----------------------------
    // await page.waitForSelector('#grid37', { timeout: 360000 });  // Ensure table is loaded
    // console.log("✅ Table found");

    // // Extract table rows
    // const companyTable = await page.evaluate(() => {
    //     const table = document.querySelector('#grid37');
    //     if (!table) return [];  // If no table is found, return empty array

    //     const rows = Array.from(table.querySelectorAll('tbody tr')); // Get rows from tbody
    //     return rows.map(row => {
    //         return Array.from(row.querySelectorAll('td')).map(cell => cell.innerText.trim());
    //     }).filter(row => row.length > 0); // Remove empty rows
    // });

    // console.log("✅ Extracted Table Rows:", companyTable);
    //----------------------------------------
    // // extract table rows
    // const companyTable = await page.evaluate(() => {
    //     const rows = Array.from(document.querySelectorAll('table tr'));
    //     console.log(rows);
    //     return rows.map(row => {
    //         return Array.from(row.querySelectorAll('td')).map(cell => cell.innerText.trim());
    //     }).filter(row => row.length > 0); // Remove empty rows
    // });

    // console.log(22,companyTable);
    
    // fs.writeFileSync('companyTable.json', JSON.stringify(companyTable, null, 2));
    //---------------------------------------
    await new Promise(resolve => setTimeout(resolve, 5000)) ;
    const newPage = await browser.newPage();

    await newPage.setViewport({ width, height });
    
    await newPage.goto('https://erp.iitkgp.ac.in/TrainingPlacementSSO/Notice.jsp', { waitUntil: 'domcontentloaded' });
    console.log("✅ 'Notice' page loaded successfully!");
    
    await newPage.waitForSelector('table');
    await new Promise(resolve => setTimeout(resolve, 5000)) 

    // Extract table rows
    const tableData = await newPage.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('table tr'));
        return rows.map(row => {
            return Array.from(row.querySelectorAll('td')).map(cell => cell.innerText.trim());
        }).filter(row => row.length > 0 && row.length <= 12); // Remove empty rows
    });

    // Save data as JSON
    // console.log(tableData);
    // console.log(tableData[3],tableData[4]);
    let msgArr = [];
    tableData.map((row) => {
        // console.log(row);
        let data = {
            "Type": row[2],
            "Subject": row[3],
            "Company": row[4],
            "Notice": row[5],
            "Notice Time": row[7],
            "Attachment": row[8] === "" ? "No" : "Yes"
        }
        const message = `📢 New Notice:
🔹 Type: ${data.Type}
📌 Subject: ${data.Subject}
🏢 Company: ${data.Company}
⏰ Time: ${data["Notice Time"]}
📎 Attachment: ${data.Attachment}
------------------------------------------------
📜 Notice: ${data.Notice}
        ` ;
        msgArr.push(message);
    });

    msgArr.shift();
    msgArr.pop();
    msgArr.pop();
    // console.log(msgArr);
    let k=2;
    let data = {
        "Type": tableData[k][2],
        "Subject": tableData[k][3],
        "Company": tableData[k][4],
        "Notice": tableData[k][5],
        "Notice Time": tableData[k][7],
        "Attachment": tableData[k][8] === "" ? "No" : "Yes"
    }
    // console.log(data);
    fs.writeFileSync('companyTable.json', JSON.stringify(tableData, null, 2));

    console.log('✅ Data extracted and saved as companyTable.json');

    // const ntfyUrl = `https://ntfy.sh/${process.env.NTFY_TOPIC}`;
    let prev_msgArr = [];
    const message = `📢 New Notice:
🔹 Type: ${data.Type}
📌 Subject: ${data.Subject}
🏢 Company: ${data.Company}
⏰ Time: ${data["Notice Time"]}
📎 Attachment: ${data.Attachment}
------------------------------------------------
📜 Notice: ${data.Notice}
        ` ;
    prev_msgArr.push(message);
    // console.log(prev_msgArr);
    // console.log(msgArr);
    try {
    
        if(JSON.stringify(msgArr) === JSON.stringify(prev_msgArr)) {
            console.log("📲 Notification already sent!,No new Notice");
            return;
        }
        const newMsg = msgArr.filter(item => !prev_msgArr.includes(item));
        newMsg.reverse();
        // console.log("NEW MSG ARR:",newMsg);
        // for (let message of newMsg) {
        //     await axios.post(`https://ntfy.sh/${process.env.NTFY_CDC_TOPIC}`, message, {
        //         headers: { 'Content-Type': 'text/plain' }
        //     });
        //     await new Promise(resolve => setTimeout(resolve, 500))  // Add a delay to ensure order (adjust as needed)
        // }
        
        console.log("📲 Notification sent successfully!");
        prev_msgArr = msgArr;
    } catch (error) {
        console.error("❌ Error sending notification:", error);
    }


    await new Promise(resolve => setTimeout(resolve, 10000)) 
    await new Promise(() => {}); // Keep the browser open
})();
