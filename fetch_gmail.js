// require('dotenv').config();
// // const fs = require('fs');
// // const path = require('path');
// const readline = require('readline');
// const { google } = require('googleapis');
// const axios = require('axios');
// // const open = require('open');
// import open from 'open';

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { google } from 'googleapis';
import axios from 'axios';
import open from 'open';
import dotenv from 'dotenv';
import { get } from 'http';
import { MongoClient } from "mongodb";
import { getTokenFromDB, saveTokenToDB, insertD, readD } from "./db.js";

dotenv.config(); // Load environment variables
// const uri =
//   `mongodb+srv://satyamR196:${process.env.mongo_pass}@fetch-gmail.q6eos.mongodb.net/?retryWrites=true&w=majority&appName=Fetch-gmail`;
// const client = new MongoClient(uri);

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

async function authenticate() {
    const credentials = {
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      redirect_uri: process.env.REDIRECT_URI,
    };
  
    const oAuth2Client = new google.auth.OAuth2(
      credentials.client_id,
      credentials.client_secret,
      credentials.redirect_uri
    );
  
    let token = await getTokenFromDB();
  
    if (!token || !token.refresh_token) {
      return getNewToken(oAuth2Client); // If no token, get a new one
    }
  
    oAuth2Client.setCredentials(token);
  
    // Refresh access token if expired
    // ✅ Use isTokenExpiring() to check if token is about to expire
    if (oAuth2Client.isTokenExpiring()) {
      try {
        const { credentials } = await oAuth2Client.refreshAccessToken();
        oAuth2Client.setCredentials(credentials);
  
        await saveTokenToDB({
          access_token: credentials.access_token,
          refresh_token: token.refresh_token, // Keep the same refresh token
          expiry_date: credentials.expiry_date,
        });
  
        console.log("✅ Access token refreshed and saved to MongoDB!");
      } catch (error) {
        console.error("❌ Failed to refresh token:", error);
        return getNewToken(oAuth2Client);
      }
    }
  
    return oAuth2Client;
}

function getNewToken(oAuth2Client) {
    return new Promise((resolve, reject) => {
        const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
        console.log("Authorize this app by visiting:", authUrl);
        open(authUrl);

        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question("Enter the code from the page: ", (code) => {
            rl.close();
            oAuth2Client.getToken(code, (err, token) => {
                if (err) return reject("Error retrieving access token", err);
                console.log("Token generated. Store this securely:", JSON.stringify(token));
                resolve(oAuth2Client);
            });
        });
    });
}

async function fetchLatestEmail(auth) {
    const gmail = google.gmail({ version: 'v1', auth });

    const res = await gmail.users.messages.list({ userId: 'me', maxResults: 1 });
    const messages = res.data.messages;

    if (!messages || messages.length === 0) {
        console.log("No new emails.");
        return null;
    }

    const email = await gmail.users.messages.get({ userId: 'me', id: messages[0].id });
    const headers = email.data.payload.headers;
    const subject = headers.find(header => header.name === "Subject")?.value || "No Subject";
    const snippet = email.data.snippet;

    console.log("📧 New Email:", subject);
    return { subject, snippet };
}


async function get_OTP() {
    try {
        const auth = await authenticate();
        const emailData = await fetchLatestEmail(auth);
        if (emailData) {
            console.log("📧 Email Data:", emailData);
            let OTP_str = emailData.subject;
            OTP_str = OTP_str.split(" ");
            let OTP = OTP_str[OTP_str.length - 1];
            console.log("OTP:", OTP, typeof OTP);
            return OTP;
            // await sendNotification(emailData.subject, emailData.snippet);
        }
    } catch (error) {
        console.error("❌ Error:", error);
    }
}

// async function main() {
//     const OTP = await getOTP();  // Now the OTP will be retrieved correctly
//     console.log("OTP from main:", OTP);
// }

get_OTP();

export default get_OTP; // Export the function for testing

