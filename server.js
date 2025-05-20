const express = require('express');
const admin = require('firebase-admin');
const axios = require('axios');
const app = express();

// Parse JSON request bodies
app.use(express.json());

// Initialize Firebase Admin SDK
const serviceAccount = require('./config/roboticsir-c2dff-firebase-adminsdk-fbsvc-d559c4cf69.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

// Web Team API Client (Isolated logic for calling their API)
class WebApiClient {
    constructor() {
        this.baseUrl = 'https://roboticsir.in/server/api/v1/'; // Replace with the actual web team's API URL
    }

    async login(email, password) {
        try {
            console.log(`Calling web team's login API with email: ${email}`);
            const response = await axios.post(`${this.baseUrl}login`, {
                email,
                password
            });

            // Validate the response format
            const { user } = response.data;
            if (!user || !user.uid || !user.name || !user.profileInfo) {
                throw new Error('Invalid response format from web API');
            }

            console.log('Received response from web team API:', response.data);
            return user;
        } catch (error) {
            console.error('Error calling web team API:', error.message);
            if (error.response) {
                console.error('Web team API response:', error.response.data);
                throw new Error(`Web team API error: ${error.response.data.error || error.message}`);
            }
            throw error;
        }
    }
}

const webApiClient = new WebApiClient();

// Endpoint to handle login
app.post('/proxy-login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            console.warn('Invalid input received:', req.body);
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // Call web team's API using the isolated client
        const user = await webApiClient.login(email, password);

        // Generate Firebase custom token
        const customToken = await admin.auth().createCustomToken(user.uid);
        console.log(`Generated Firebase custom token for UID: ${user.uid}`);

        // Respond to the app with the custom token and user data
        res.status(200).json({
            customToken,
            user: {
                uid: user.uid,
                name: user.name,
                profileInfo: user.profileInfo
            }
        });
    } catch (error) {
        console.error('Error in /proxy-login:', error.message);
        if (error.message.includes('Web team API error')) {
            return res.status(401).json({ error: error.message });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add a root route for debugging
app.get('/', (req, res) => {
    res.status(200).send('RoboSir Intermediate Server is running! Use POST /proxy-login to login.');
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Intermediate server running on port ${PORT}`);
});