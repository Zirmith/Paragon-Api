const express = require("express");
const app = express();
const cors = require("cors");
const os = require("os");
app.use(cors());
app.use(express.static("public"));
app.use(express.json());
const NodeCache = require("node-cache");
const cache = new NodeCache();
const session = require("express-session");
const getmac = require("getmac");
const errorHandler = require('express-error-handler');
const { logger } = require('./logging');
const dotenv = require("dotenv");
dotenv.config();


const port = process.env.PORT || 3000;


const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const MONGO_URL = process.env.MONGO_URL;

const api_settings = {
  allow_access_by_default: true,
  api_key_prefix: "paradox_key",
  api_max_day_usage: 30,
  api_rate_limit: 1000,

  api_sources: [
    {
      name: "Paradox",
      url: "localhost:3000",
    },
  ],
};

// Store the users in a simple array for demo purposes

const uuid = require("uuid");
const MongoStore = require("connect-mongo");

//Paragon
//thevoidis2

app.use(
  session({
    secret: "your-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
    store: MongoStore.create({
      mongoUrl:
       MONGO_URL,
    }),
  })
);

const { MongoClient } = require("mongodb");

const mongoClient = new MongoClient(
  MONGO_URL,
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }
);

mongoClient.connect().then(() => {
    logger.info("Connected to MongoDB");
}).catch((err) => {
  logger.error(err);
  process.exit(1);
})

const usersCollection = mongoClient.db().collection("sessions");

app.get("/", (req, res) => {
  res.sendFile(__dirname + "./public/index.html");
});

const axios = require("axios");

async function validateApiKey(apiKey) {
  const hwid = getmac.default();

  try {
    const userData = await usersCollection.findOne({ apiKey });

    if (!userData) {
      throw new Error("API key not found");
    }

    if (userData.hwid !== hwid) {
      throw new Error("Invalid API key");
    }

    // Increase the usage value of the API key
    const newUsageValue = userData.usage + 1;
    await usersCollection.updateOne(
      { apiKey },
      { $set: { usage: newUsageValue } }
    );

    return userData;
  } catch (error) {
    console.error(error);
    throw new Error(error.message);
  }
}

app.get("/v1/example", async (req, res) => {
  try {
    const apiKey = req.query.api_key;
    const isValid = await validateApiKey(apiKey);

    if (!isValid) {
      res.status(401).json({ error: "Invalid API key" });
      return;
    }

   
    // Handle the request
    res.json({ message: "Success!" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});



app.get("/v1/login", (req, res) => {
  const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=identify`;
  res.redirect(authUrl);
});

app.get("/v1/callback", async (req, res) => {
  const { code } = req.query;
  logger.info(`Received code:  ${code}`);
  try {
    const { data } = await axios({
      method: "POST",
      url: "https://discord.com/api/oauth2/token",
      data: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
      }),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const { access_token } = data;

    // Use the access token to make API requests on behalf of the user
    console.log(access_token);
    const { data: user } = await axios({
      method: "GET",
      url: "https://discord.com/api/users/@me",
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
      params: {
        fields: "id",
      },
    });

    // Generate a random API key
    const hwid = getmac.default();

    const apiKey = uuid.v4();
    const newuser = {
      id: user.id,
      username: user.username,
      apiKey: apiKey,
      hwid: hwid,
      usage: 0,
      max_uses: api_settings.api_max_day_usage,
    };

    // Check if a user already exists with the same Discord ID
    const existingUser = await usersCollection.findOne({ id: user.id });
    if (existingUser) {
      // Delete the existing user
      await usersCollection.findOneAndReplace({ id: user.id }, newuser);
    } else {
      // Insert user data into MongoDB collection
      await usersCollection.insertOne(newuser);
    }

    // Store the API key in cache
    cache.set(hwid, apiKey);

    // Store user in session
    req.session.user = user;
    logger.info(`Logged in as ${user.username}`);
    setTimeout(() => {
      res.redirect("/");
    }, 1000);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
    logger.error(error);
  }
});


app.get("/v1/me", async (req, res) => {
  // Checking if req.session.user exists before destructuring it
  const user = req.session.user || {};

  if (!user || !user.id) {
    res.status(401).json({ error: "Unauthorized" });
  } else {
    const hwid = getmac.default();

    try {
      // Delete any duplicate users with the same HWID
      await usersCollection.deleteMany({ hwid, id: { $ne: user.id } });

      const userData = await usersCollection.findOne({ hwid }); // Retrieve user data from MongoDB collection
      if(userData.username) {
        logger.info(`Logged in as ${userData._id}`);
      } else {
        logger.info(`Could not find username for ${hwid}`);
      }
     
      if (!userData || userData.id !== user.id) {
        res.status(404).json({ error: "API key not found" });
        logger.error("API key not found");
      } else {
        const apiKey = cache.get(hwid);
        res.json({ userData });
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal Server Error" });
      logger.error(error);
    }
  }
});

// Set up error handling
app.use(errorHandler({
  log: ({ level, message, error }, _err, _req, _res) => {
    logger.log(level, message, { error });
  },
}));

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});

