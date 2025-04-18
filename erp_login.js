import puppeteer from "puppeteer";
import dotenv from "dotenv";
import get_OTP from "./fetch_gmail.js";
import promptSync from 'prompt-sync';

const prompt = promptSync(); // Call the default function
const mode = prompt('Enter mode of OTP entry : auto / manual (default) ?', 'manual');
console.log(`Chosen Mode : , ${mode}!`);

dotenv.config();

let Q_A = {
    [process.env.SQ1]: process.env.A1,
    [process.env.SQ2]: process.env.A2,
    [process.env.SQ3]: process.env.A3,
};

async function delay(t) {
    return new Promise((resolve) => setTimeout(resolve, t * 1000));
    // console.log("Delay for", t, "seconds");
}

const main = async () => {
    const browser = await puppeteer.launch({
        headless: false,
        args: ["--start-maximized"],
    }); // Set headless to false for debugging
    const page = await browser.newPage();

    page.setDefaultTimeout(3600000); // 60 min default for all locators
    page.setDefaultNavigationTimeout(3600000); // 60 min default for all navigation

    // Get the screen dimensions from Puppeteer
    const { width, height } = await page.evaluate(() => ({
        width: window.screen.width,
        height: window.screen.height,
    }));

    // Set the viewport to match the full screen size
    await page.setViewport({ width, height });

    // Navigate to the ERP login page
    await page.goto("https://erp.iitkgp.ac.in/", { waitUntil: "networkidle2" });

    try {
        await page.locator('input[name="user_id"]').fill(process.env.ERP_USERNAME);
        await page.locator('input[name="password"]').fill(process.env.ERP_PASSWORD);

        await page.waitForFunction(() => {
            const label = document.querySelector('label[for="answer"]');
            return label && label.innerText.trim().length > 0;
        });

        const securityQuestion = await page.evaluate(() => {
            return document.querySelector('label[for="answer"]').innerText;
        });

        let answer = Q_A[securityQuestion];
        if (!answer) throw new Error("Security Question not recognized!");

        await page.locator('input[name="answer"]').fill(answer);
    } catch (error) {
        console.error("❌ Error occurred in Username or Password or Security Question:",error);
        console.error("Restarting after 10 seconds...");
        await browser.close();
        await delay(10);
        await main(); // Retry after 10 seconds
        return;
    }

    try {
        // OTP Fetch from gmail API Fill up
        page.on("dialog", async (dialog) => {
            console.log("Popup Message:", dialog.message());
            await dialog.accept();
        });

        await page.locator("#getotp").click();
        let OTP = null;
        if(mode === 'manual'){
            console.log("OTP sent! Enter OTP from gmail...");
            OTP = prompt('Enter OTP from gmail: ');
        }else{
            console.log("OTP sent! fetching OTP from gmail...");
            await delay(15);
            OTP = await get_OTP();
        }
        
        console.log("OTP:", OTP, typeof parseInt(OTP));
        if (!OTP || isNaN(parseInt(OTP))) throw new Error("Failed to retrieve OTP! OTP isn't a number Retry!");

        await delay(5);
        await page.locator('input[name="email_otp"]').fill(OTP);
        
        try {
            await page.locator("#loginFormSubmitButton").click();
        } catch (error) {
            console.error("❌ Error in clicking login button", error);
            console.error("Restarting after 10 seconds...");
            await browser.close();
            await page.screenshot({ path: "debug.png", fullPage: true });
            delay(10);
            await main();
        }
        await page.waitForNavigation({ waitUntil: "networkidle2" });
        console.log("Logged in successfully!");

    } catch (error) {
        console.error("❌ Error occurred in OTP fetching, try again", error);
        console.error("Restarting after 10 seconds...");
        // sendErrorNotification(error.message);
        await browser.close();
        await delay(10);
        await main(); // Retry after 10 seconds
        return;
    }

    await new Promise(() => { }); // Keep the browser open
};

main().catch((error) => {
    console.error("❌ Error in main function:", error);
});
