import puppeteer from 'puppeteer';
import dotenv from 'dotenv';
import get_OTP from './fetch_gmail.js';
import fs from 'fs';
import axios from 'axios';

dotenv.config();

let Q_A = {
    [process.env.SQ1]: process.env.A1,
    [process.env.SQ2]: process.env.A2,
    [process.env.SQ3]: process.env.A3,
};

async function sendErrorNotification(comments=" ",errorMessage) {

    await axios.post(`https://ntfy.sh/${process.env.NTFY_ERROR_TOPIC}`, `❌ Error occurred${comments}: ${errorMessage}`, {
        headers: { 'Content-Type': 'text/plain' }
    });
    console.log('📲 Error notification sent');

}

// let notice_data_path = "/tmp/notice_data.json";

// if (!fs.existsSync(notice_data_path)) {
    // fs.writeFileSync(notice_data_path, "[]");
// }

// let notice_data = fs.readFileSync(notice_data_path, 'utf8');
// notice_data = JSON.parse(notice_data);
// let prev_msgArr = notice_data;
// let msgArr = prev_msgArr;

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

        await page.goto('https://erp.iitkgp.ac.in/', { waitUntil: 'networkidle2' });

        try {
            await page.waitForSelector('input[name="user_id"]', { visible: true, timeout: 10000 });
            await page.type('input[name="user_id"]', process.env.ERP_USERNAME);
            await new Promise(resolve => setTimeout(resolve, 3000)) ;
            await page.type('input[name="password"]', process.env.ERP_PASSWORD);

            await page.waitForFunction(() => {
                const label = document.querySelector('label[for="answer"]');
                return label && label.innerText.trim().length > 0;
            }, { timeout: 10000 });

            const securityQuestion = await page.evaluate(() => {
                return document.querySelector('label[for="answer"]').innerText;
            });

            let answer = Q_A[securityQuestion];
            if (!answer) throw new Error("Security Question not recognized!");

            await page.type('input[name="answer"]', answer);
        } catch (error) {
            console.error("❌ Error occurred in Username or Password or Security Question:", error);
            console.error("Restarting after 10 seconds...");
            sendErrorNotification(error.message);
            browser.close();
            setTimeout(main, 10000); // Retry after 10 seconds
        }
        
        try { // OTP Fetch from gmail API Fill up 
            page.on('dialog', async dialog => {
                console.log("Popup Message:", dialog.message());
                await dialog.accept();
            });
    
            await page.click('#getotp');
            console.log("OTP sent! fetching OTP from gmail...");
    
            await new Promise(resolve => setTimeout(resolve, 12000));
            let OTP = await get_OTP();
            if (!OTP) throw new Error("Failed to retrieve OTP!");
    
            await page.type('input[name="email_otp"]', OTP);
            await page.click('#loginFormSubmitButton');
            await page.waitForNavigation({ timeout: 15000 });
        } catch (error) {
            console.error("❌ Error occurred in OTP fetching, try again", error);
            console.error("Restarting after 10 seconds...");
            sendErrorNotification(error.message);
            browser.close();
            setTimeout(main, 10000); // Retry after 10 seconds
        }
        // ----------------- LOGIN TILL HERE -----------------

        try {
            await page.goto('https://erp.iitkgp.ac.in/TrainingPlacementSSO/Notice.jsp', { waitUntil: 'domcontentloaded' });
        } catch (error) {
            console.error("❌ Error in opening url of Notice.jsp", error);
            console.error("Restarting after 10 seconds...");
            sendErrorNotification(error.message);
            browser.close();
            setTimeout(main, 10000); // Retry after 10 seconds   
        }
        
        async function send_notice() {
            try {
                await page.reload({ waitUntil: 'load' });
                let tableData;
                try {
                    await page.waitForSelector('table', { timeout: 10000 });
                    await new Promise(resolve => setTimeout(resolve, 4000)) ;
                    tableData = await page.evaluate(() => {
                        const rows = Array.from(document.querySelectorAll('table tr'));
                        return rows.map(row => {
                            return Array.from(row.querySelectorAll('td')).map(cell => cell.innerText.trim());
                        }).filter(row => row.length > 0 && row.length <= 12);
                    });
                } catch (error) {
                    console.error("❌ Error in fetching table data", error);
                    console.error("Retry after 10 seconds...");
                    sendErrorNotification(error.message);
                    setTimeout(send_notice, 10000); // Retry after 10 seconds
                }
                console.log("Table Data:", tableData.length);
                msgArr = tableData.map(row => {
                    return `📢 New Notice:\n🔹 Type: ${row[2]}\n📌 Subject: ${row[3]}\n🏢 Company: ${row[4]}\n⏰ Time: ${row[7]}\n📎 Attachment: ${row[8] === "" ? "No" : "Yes"}\n------------------------------------------------\n📜 Notice: ${row[5]}`;
                });
                msgArr = msgArr.slice(1, -2);
                console.log("prev_msgArr:", prev_msgArr.length);
                console.log("msgArr:", msgArr.length);
                if(msgArr.length === 0 ){
                    console.error("Retrying after 10 seconds...because msgArr is empty, may be table not loaded properly");
                    setTimeout(send_notice, 10000); // Retry after 10 seconds
                    return;
                }
                if (JSON.stringify(msgArr) === JSON.stringify(prev_msgArr)) {
                    console.log("📲 No new notices.");
                    return;
                }
                const newMsg = msgArr.filter(item => !prev_msgArr.includes(item));
                newMsg.reverse();
                console.log("new_Msg:", newMsg.length);
                prev_msgArr = msgArr;
                // fs.writeFileSync(notice_data_path, JSON.stringify(prev_msgArr, null, 2));
                for (let message of newMsg) {
                    await axios.post(`https://ntfy.sh/${process.env.NTFY_CDC_TOPIC}`, message, {
                        headers: { 'Content-Type': 'text/plain' }
                    });
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                console.log("📲 Notification sent successfully!");
            } catch (error) {
                console.error("❌ Error sending notices:", error);
                console.error("Restarting after 10 seconds...");
                sendErrorNotification(" in sending notification, line 182",error.message);
                setTimeout(send_notice, 10000); // Retry after 10 seconds
            }
        }

        setInterval(send_notice, 51000);
        await new Promise(() => {});

    } catch (error) {
        console.error("❌ Error occurred:", error);
        console.error("Restarting after 10 seconds...");
        await sendErrorNotification(",in outer main line ~191, restarting main()",error.message);
        await browser.close();
        setTimeout(main, 10000); // Retry after 10 seconds
    }
};

main() ;