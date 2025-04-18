import puppeteer from 'puppeteer';
import dotenv from 'dotenv';
import get_OTP from './fetch_gmail.js';
import axios from 'axios';

dotenv.config();

let Q_A = {
    [process.env.SQ1]: process.env.A1,
    [process.env.SQ2]: process.env.A2,
    [process.env.SQ3]: process.env.A3,
};

async function delay(t) {
    return new Promise(resolve => setTimeout(resolve, t*1000));
  // console.log("Delay for", t, "seconds");
}

async function sendErrorNotification(comments=" ",errorMessage) {
    try {
        await axios.post(`https://ntfy.sh/${process.env.NTFY_ERROR_TOPIC}`, `❌ Error occurred${comments}: ${errorMessage}`, {
            headers: { 'Content-Type': 'text/plain' }
        });
        console.log('📲 Error notification sent');
    } catch (error) {
        console.error("❌ Error in sending ERROR notification, may be daily limit reached", error.message);
        console.error("Retry after 1 hour...");
        // setTimeout(sendErrorNotification, 3600000); // Retry after 1 hour    
    }
}

let prev_msgArr = [];
let msgArr = [];

async function main() {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            // headless: false,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                // "--disable-dev-shm-usage",
                // "--disable-gpu",
                // "--no-zygote",
                // "--single-process"
            ]
        });
        const page = await browser.newPage();

        page.setDefaultTimeout(3600000); // 60 min default for all locators
        page.setDefaultNavigationTimeout(3600000); // 60 min default for all navigation

        await page.goto('https://erp.iitkgp.ac.in/', { waitUntil: 'networkidle2' });

        try {
            // await page.waitForSelector('input[name="user_id"]', { visible: true, timeout: 10000 });
            await page.locator('input[name="user_id"]').fill(process.env.ERP_USERNAME);
            // await page.type('input[name="user_id"]', process.env.ERP_USERNAME);
            // await new Promise(resolve => setTimeout(resolve, 3000)) ;
            await page.locator('input[name="password"]').fill(process.env.ERP_PASSWORD);
            // await page.type('input[name="password"]', process.env.ERP_PASSWORD);

            await page.waitForFunction(() => {
                const label = document.querySelector('label[for="answer"]');
                return label && label.innerText.trim().length > 0;
            });

            const securityQuestion = await page.evaluate(() => {
                return document.querySelector('label[for="answer"]').innerText;
            });

            let answer = Q_A[securityQuestion];
            if (!answer) throw new Error("Security Question not recognized!");

            // await page.type('input[name="answer"]', answer);
            await page.locator('input[name="answer"]').fill(answer);
        } catch (error) {
            console.error("❌ Error occurred in Username or Password or Security Question:", error);
            console.error("Restarting after 10 seconds...");
            // sendErrorNotification(error.message);
            await browser.close();
            await delay(10);
            await main() ; // Retry after 10 seconds
            return ;
        }
        
        try { // OTP Fetch from gmail API Fill up 
            page.on('dialog', async dialog => {
                console.log("Popup Message:", dialog.message());
                await dialog.accept();
            });
    
            // await page.click('#getotp');
            await page.locator('#getotp').click();
            console.log("OTP sent! fetching OTP from gmail...");
    
            await delay(15);
            let OTP = await get_OTP();
            console.log("OTP:", OTP, typeof parseInt(OTP));
            if (!OTP || isNaN(parseInt(OTP))) throw new Error("Failed to retrieve OTP!");

            // await page.type('input[name="email_otp"]', OTP);
            await delay(5);
            await page.locator('input[name="email_otp"]').fill(OTP);
            // await page.click('#loginFormSubmitButton');
            try{
                await page.locator('#loginFormSubmitButton').click();
            }catch(error){
                console.error("❌ Error in clicking login button", error);
                console.error("Restarting after 10 seconds...");
                // sendErrorNotification(error.message);
                await browser.close();
                await page.screenshot({ path: 'debug.png', fullPage: true });
            }
            await page.waitForNavigation({ waitUntil: 'networkidle2' });  
            console.log("Logged in successfully!"); 
            await delay(10) ;
        } catch (error) {
            console.error("❌ Error occurred in OTP fetching, try again", error);
            console.error("Restarting after 10 seconds...");
            // sendErrorNotification(error.message);
            await browser.close();
            await delay(10);
            await main() ; // Retry after 10 seconds
            return ;
        }
        // ----------------- LOGIN TILL HERE -----------------

        try {
            console.log("Opening Notice.jsp...");
            await page.goto('https://erp.iitkgp.ac.in/TrainingPlacementSSO/Notice.jsp', { waitUntil: 'networkidle2' });
            console.log("Opened Notice.jsp successfully!");
        } catch (error) {
            console.error("❌ Error in opening url of Notice.jsp", error);
            console.error("Restarting after 10 seconds...");
            // sendErrorNotification(error.message);
            await browser.close();
            await delay(10);
            await main() ; // Retry after 10 seconds
            return ;
        }
        
        async function send_notice() {
            try {
                // await delay(5);
                console.log("Reloading page...");
                // await page.locator('#grid54 tbody tr[role="row"]').nth(4).wait(); // waits for at least 5 rows (0-based index)
                await page.reload({ waitUntil: 'networkidle2' });
                // await page.locator('#grid54 tbody tr[role="row"]').wait();
                console.log("Reloaded page...waiting for 0s...");
                // await delay(10) ;
                console.log("waited for 0s...  then list...");
                //Below line causing timeout error
                let list = await page.waitForFunction(() => {
                    console.log("Current row count:", document.querySelectorAll('#grid54 tbody tr[role="row"]').length);
                    return document.querySelectorAll('table tbody tr[role="row"]').length >= 5;
                });        
                console.log("List 1:", list, new Date().toLocaleTimeString());
                let tableData;
                try {
                    await page.waitForSelector('table');
                    // delay(10) ;
                    tableData = await page.evaluate(() => {
                        const rows = Array.from(document.querySelectorAll('table tr'));
                        return rows.map(row => {
                            return Array.from(row.querySelectorAll('td')).map(cell => cell.innerText.trim());
                        }).filter(row => row.length > 0 && row.length <= 12);
                    }) || prev_msgArr;  // Ensure it is always an array
                } catch (error) {
                    console.error("❌ Error in fetching table data", error);
                    console.error("Retry after 30 seconds...");
                    // sendErrorNotification(error.message);
                    await delay(30) ;
                    await send_notice(); // Retry after 10 seconds
                }

                // console.log("Table Data:", tableData.length);
                msgArr = tableData.map(row => {
                    return `📢 New Notice:\n🔹 Type: ${row[2]}\n📌 Subject: ${row[3]}\n🏢 Company: ${row[4]}\n⏰ Time: ${row[7]}\n📎 Attachment: ${row[8] === "" ? "No" : "Yes"}\n------------------------------------------------\n📜 Notice: ${row[5]}`;
                });

                if(msgArr.length == 0 ){
                    console.error("Retrying after 15 seconds...because msgArr is empty, may be table not loaded properly");
                    try {
                        await delay(15) ;
                        await send_notice();   
                    } catch (error) {
                        console.log("Error in setTimeout(send_notice, line 158)",error.message);
                    }
                     // Retry after 10 seconds
                    return;
                }

                msgArr = msgArr.slice(1, -2);
                if(msgArr.length == 0 ){
                    console.error("Retrying after 15 seconds...because msgArr is empty, may be table not loaded properly");
                    await page.goto('https://erp.iitkgp.ac.in/TrainingPlacementSSO/Notice.jsp', { waitUntil: 'domcontentloaded' });
                    await delay(15) ;
                    await send_notice();
                    return;
                }
                console.log("prev_msgArr:", prev_msgArr.length);
                console.log("msgArr:", msgArr.length);
                if (JSON.stringify(msgArr) === JSON.stringify(prev_msgArr)) {
                    console.log("📲 No new notices.");
                    return;
                }
                const newMsg = msgArr.filter(item => !prev_msgArr.includes(item));
                newMsg.reverse();
                console.log("new_Msg:", newMsg.length);
                prev_msgArr = msgArr;
                // fs.writeFileSync(notice_data_path, JSON.stringify(prev_msgArr, null, 2));
                try {
                    for (let message of newMsg) {
                        await axios.post(`https://ntfy.sh/${process.env.NTFY_CDC_TOPIC}`, message, {
                            headers: { 'Content-Type': 'text/plain' }
                        });
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                    console.log("📲 Notification sent successfully!");
                } catch (error) {
                    console.error("❌ NTFY SERVER ERROR, may be daily limit reached, recalling fxn in 1 hour", error.message);
                    // sendErrorNotification("❌ NTFY SERVER ERROR, may be daily limit reached",error.message);
                    await delay(3600) ;
                    await send_notice(); // Retry after 1 hour
                    return;
                }
                
            } catch (error) {
                console.error("❌ Error sending notices:", error);
                console.error("Restarting after 60 seconds...");
                await page.screenshot({ path: 'before-wait.png' });
                // sendErrorNotification(" in sending notification, line 182",error.message);
                await delay(60) ;
                await send_notice(); // Retry after 1 hour
                return;
            }
        }

        setInterval(send_notice, 60000);
        return;
        // await new Promise(() => {});

    } catch (error) {
        console.error("❌ Error occurred:", error);
        console.error("Restarting after 60 seconds...");
        // await sendErrorNotification(",in outer main line ~191, restarting main()",error.message);
        await await browser.close();
        await await delay(60)
        await main(); // Retry after 60 seconds
    }
};

main() ;